import { randomUUID } from 'crypto';
import { statSync } from 'node:fs';
import type Database from 'better-sqlite3';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { crawlerDefinitions } from './crawler-definitions.js';
import type { MediaStore, MediaPathInfo } from './media-store.js';
import { mimeFromName, extFromMime } from './media-store.js';
import { downloadVideoWithFfmpeg } from './ffmpeg.js';

export async function buildApp(db: Database.Database, mediaStore: MediaStore) {
  const fastify = Fastify({ logger: false, bodyLimit: 50 * 1024 * 1024 });

  await fastify.register(cors);
  await fastify.register(multipart);

  // Prepared statements
  const upsertRawCrawl = db.prepare(`
    INSERT INTO raw_crawls (taskId, site, itemKey, payload)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(taskId, itemKey) DO UPDATE SET
      payload = excluded.payload
  `);

  const insertCrawlLog = db.prepare(`
    INSERT INTO crawl_logs (taskId, level, message, data)
    VALUES (?, ?, ?, ?)
  `);

  const insertMediaFile = db.prepare(`
    INSERT INTO media_files (rawCrawlId, role, filePath, mimeType, size)
    VALUES (?, ?, ?, ?, ?)
  `);

  const deleteMediaForCrawl = db.prepare(`
    DELETE FROM media_files WHERE rawCrawlId = ?
  `);

  // API Routes
  fastify.register(
    async (api) => {
      // GET /api/definitions
      api.get('/definitions', async () => crawlerDefinitions);

      // GET /api/tasks — all tasks (for the dashboard)
      api.get('/tasks', async () => {
        return db.prepare('SELECT * FROM tasks ORDER BY updatedAt DESC').all();
      });

      // GET /api/tasks/pending — pending tasks (for the userscript)
      api.get('/tasks/pending', async () => {
        return db.prepare("SELECT * FROM tasks WHERE status = 'pending'").all();
      });

      // GET /api/tasks/actionable — pending + running tasks (handles interrupted crawls)
      // Includes itemCount so the crawler can detect stale bookmarks after data wipes
      api.get('/tasks/actionable', async () => {
        return db
          .prepare(
            `SELECT t.*, COALESCE(c.cnt, 0) AS itemCount
             FROM tasks t
             LEFT JOIN (SELECT taskId, COUNT(*) AS cnt FROM raw_crawls GROUP BY taskId) c
               ON c.taskId = t.id
             WHERE t.status IN ('pending', 'running')`,
          )
          .all();
      });

      // POST /api/tasks
      api.post('/tasks', async (request, reply) => {
        const { siteId, config } = request.body as { siteId: string; config: any };
        const definition = crawlerDefinitions.find((d) => d.id === siteId);
        if (!definition) return reply.status(400).send({ error: 'Invalid site' });

        const id = randomUUID();
        const name = config.taskName || definition.name;

        // Derive targetUrl from crawler-specific fields
        const targetUrl = definition.deriveTargetUrl?.(config) ?? config.targetUrl ?? null;

        db.prepare(
          'INSERT INTO tasks (id, site, name, targetUrl, config) VALUES (?, ?, ?, ?, ?)',
        ).run(id, siteId, name, targetUrl, JSON.stringify(config));

        return { success: true, id };
      });

      // POST /api/collect — store raw crawl data and media files
      api.post('/collect', async (request, reply) => {
        try {
          let payload: any = null;
          let site: string = '';
          let taskId: string = '';
          let itemKey: string | null = null;

          const contentType = request.headers['content-type'];

          if (contentType?.includes('multipart/form-data')) {
            const parts = request.parts();
            const images: { name: string; content: Buffer }[] = [];
            for await (const part of parts) {
              if (part.type === 'file') {
                const buffer = await part.toBuffer();
                images.push({ name: part.filename, content: buffer });
              } else {
                if (part.fieldname === 'site') site = part.value as string;
                if (part.fieldname === 'taskId') taskId = part.value as string;
                if (part.fieldname === 'itemKey') itemKey = (part.value as string) || null;
                if (part.fieldname === 'payload') payload = JSON.parse(part.value as string);
              }
            }
            // Attach multipart images to payload
            if (images.length > 0 && payload) {
              payload.images = images.map((img) => ({
                name: img.name,
                data: img.content.toString('base64'),
              }));
            }
          } else {
            const body = request.body as any;
            site = body.site;
            taskId = body.taskId;
            payload = body.payload;
            itemKey = body.itemKey || null;
          }

          if (!taskId) {
            return reply.status(400).send({ error: 'Missing taskId' });
          }

          const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
          if (!task) {
            return reply.status(404).send({ error: 'Task not found' });
          }

          // Build path info from task config + payload metadata
          const taskConfig = JSON.parse(task.config || '{}');

          // Build identifier: for vehicles use make/model/year/vin hierarchy,
          // for social posts use profileId
          let identifier: string;
          if (payload?.vin || payload?.stockNumber) {
            const parts = [
              payload.make?.toLowerCase(),
              payload.model?.toLowerCase(),
              payload.year?.toString(),
              payload.vin || payload.stockNumber,
            ].filter(Boolean);
            identifier = parts.join('/');
          } else {
            identifier = taskConfig.profileId || taskConfig.identifier || itemKey || 'unknown';
          }

          const pathInfo: MediaPathInfo = {
            site,
            identifier,
            postDate: payload?.postDate || '',
            postText: payload?.text || payload?.title || '',
            itemKey: itemKey || taskId,
          };

          // Store raw crawl (upsert by taskId + itemKey)
          upsertRawCrawl.run(taskId, site, itemKey, JSON.stringify(payload));

          const rawRow = db
            .prepare('SELECT id FROM raw_crawls WHERE taskId = ? AND itemKey = ?')
            .get(taskId, itemKey) as { id: number } | undefined;
          const rawCrawlId = rawRow?.id;

          if (rawCrawlId) {
            // Clear old media files from disk and DB on re-collect
            const oldFiles = db
              .prepare('SELECT filePath FROM media_files WHERE rawCrawlId = ?')
              .all(rawCrawlId) as { filePath: string }[];
            for (const f of oldFiles) {
              mediaStore.delete(f.filePath);
            }
            deleteMediaForCrawl.run(rawCrawlId);

            // Compute post path once for all media in this post
            const { dir, prefix } = mediaStore.postPath(pathInfo);

            /** Save a base64-encoded media file and insert a DB row. */
            function saveMedia(
              data: string,
              fileName: string,
              mediaName: string,
              role: string,
            ): void {
              const buffer = Buffer.from(data, 'base64');
              const mimeType = mimeFromName(fileName);
              const ext = extFromMime(mimeType);
              const relativePath = `${dir}/${prefix}-${mediaName}.${ext}`;
              mediaStore.write(relativePath, buffer);
              insertMediaFile.run(rawCrawlId, role, relativePath, mimeType, buffer.length);
            }

            // Save images
            if (payload?.images) {
              for (let i = 0; i < payload.images.length; i++) {
                const img = payload.images[i];
                if (!img.data) continue;
                const mediaName = payload.images.length === 1 ? 'image' : `image${i + 1}`;
                saveMedia(img.data, img.name || 'image.jpg', mediaName, 'image');
              }
            }

            // Save video poster
            if (payload?.videoPoster?.data) {
              saveMedia(
                payload.videoPoster.data,
                payload.videoPoster.name || 'poster.jpg',
                'poster',
                'video-poster',
              );
            }

            // Download video via ffmpeg from DASH/HLS manifest (non-blocking)
            if (payload?.videoCdnUrls && Array.isArray(payload.videoCdnUrls)) {
              const urls = payload.videoCdnUrls as string[];
              const dashUrl = urls.find(
                (u) => /\.mpd/i.test(u) || (/\/dash\//i.test(u) && !/webvtt|caption/i.test(u)),
              );
              const hlsUrl = urls.find((u) => /\.m3u8/i.test(u));
              const manifestUrl = dashUrl || hlsUrl;

              if (manifestUrl) {
                const relativePath = `${dir}/${prefix}-video.mp4`;
                const outputPath = mediaStore.fullPath(relativePath);
                mediaStore.ensureDirFor(relativePath);

                // Fire-and-forget: don't block the HTTP response
                downloadVideoWithFfmpeg(manifestUrl, outputPath)
                  .then(() => {
                    const size = statSync(outputPath).size;
                    insertMediaFile.run(rawCrawlId, 'video', relativePath, 'video/mp4', size);
                  })
                  .catch((err: any) => {
                    console.warn(`[Collect] ffmpeg video download failed: ${err.message}`);
                  });
              }
            }
          }

          db.prepare('UPDATE tasks SET updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(taskId);

          return { success: true };
        } catch (err: any) {
          console.error('[Collect] Critical Error:', err);
          return reply.status(500).send({ error: err.message });
        }
      });

      // GET /api/tasks/:id/items -- list raw crawl items for a task
      api.get('/tasks/:id/items', async (request) => {
        const { id } = request.params as { id: string };
        const items = db
          .prepare(
            'SELECT id, taskId, site, itemKey, payload, createdAt FROM raw_crawls WHERE taskId = ? ORDER BY createdAt DESC',
          )
          .all(id);
        return items;
      });

      // GET /api/media/:id -- serve a media file by its DB id
      api.get('/media/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const row = db
          .prepare('SELECT filePath, mimeType FROM media_files WHERE id = ?')
          .get(id) as { filePath: string; mimeType: string } | undefined;
        if (!row) return reply.status(404).send({ error: 'Media not found' });
        const data = mediaStore.read(row.filePath);
        if (!data) return reply.status(404).send({ error: 'File not found on disk' });
        return reply.type(row.mimeType).send(data);
      });

      // GET /api/tasks/:id/media -- list media files for a task's items
      api.get('/tasks/:id/media', async (request) => {
        const { id } = request.params as { id: string };
        const files = db
          .prepare(
            `SELECT mf.id, mf.rawCrawlId, mf.role, mf.filePath, mf.mimeType, mf.size, mf.createdAt
             FROM media_files mf
             JOIN raw_crawls rc ON rc.id = mf.rawCrawlId
             WHERE rc.taskId = ?
             ORDER BY mf.createdAt DESC`,
          )
          .all(id);
        return files;
      });

      // DELETE /api/tasks/:id — delete a task and all associated data
      api.delete('/tasks/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
        if (!task) return reply.status(404).send({ error: 'Task not found' });

        // Delete media files from disk
        const mediaFiles = db
          .prepare(
            `SELECT mf.filePath FROM media_files mf
             JOIN raw_crawls rc ON rc.id = mf.rawCrawlId
             WHERE rc.taskId = ?`,
          )
          .all(id) as { filePath: string }[];
        for (const f of mediaFiles) {
          mediaStore.delete(f.filePath);
        }

        // Cascade deletes in correct order
        db.prepare(
          `DELETE FROM media_files WHERE rawCrawlId IN
             (SELECT id FROM raw_crawls WHERE taskId = ?)`,
        ).run(id);
        db.prepare('DELETE FROM raw_crawls WHERE taskId = ?').run(id);
        db.prepare('DELETE FROM crawl_logs WHERE taskId = ?').run(id);
        db.prepare('DELETE FROM tasks WHERE id = ?').run(id);

        return { deleted: true };
      });

      // PUT /api/tasks/:id — update task fields
      api.put('/tasks/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as
          | { id: string; name: string; targetUrl: string; config: string }
          | undefined;
        if (!task) return reply.status(404).send({ error: 'Task not found' });

        const body = request.body as {
          name?: string;
          targetUrl?: string;
          config?: Record<string, unknown>;
        };

        const updates: string[] = [];
        const values: unknown[] = [];

        if (body.name !== undefined) {
          updates.push('name = ?');
          values.push(body.name);
        }
        if (body.targetUrl !== undefined) {
          updates.push('targetUrl = ?');
          values.push(body.targetUrl);
        }
        if (body.config !== undefined) {
          const existing = JSON.parse(task.config || '{}');
          Object.assign(existing, body.config);
          updates.push('config = ?');
          values.push(JSON.stringify(existing));
        }

        if (updates.length > 0) {
          updates.push('updatedAt = CURRENT_TIMESTAMP');
          values.push(id);
          db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        }

        const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
        return updated;
      });

      // POST /api/tasks/:id/config — merge fields into task config
      api.post('/tasks/:id/config', async (request, _reply) => {
        const { id } = request.params as { id: string };
        const updates = request.body as Record<string, unknown>;
        const task = db.prepare('SELECT config FROM tasks WHERE id = ?').get(id) as
          | { config: string }
          | undefined;
        const config = JSON.parse(task?.config || '{}');
        Object.assign(config, updates);
        db.prepare('UPDATE tasks SET config = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(
          JSON.stringify(config),
          id,
        );
        return { success: true };
      });

      // POST /api/tasks/:id/status
      api.post('/tasks/:id/status', async (request, reply) => {
        const { id } = request.params as { id: string };
        const { status } = request.body as { status: string };
        const validStatuses = ['pending', 'running', 'completed', 'failed'];
        if (!validStatuses.includes(status)) {
          return reply.status(400).send({ error: 'Invalid status' });
        }
        db.prepare('UPDATE tasks SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(
          status,
          id,
        );
        return { success: true };
      });

      // POST /api/tasks/:id/log — fire-and-forget log from Tampermonkey
      api.post('/tasks/:id/log', async (request, _reply) => {
        const { id } = request.params as { id: string };
        const { level, message, data } = request.body as {
          level: string;
          message: string;
          data?: Record<string, unknown>;
        };
        insertCrawlLog.run(id, level || 'info', message || '', data ? JSON.stringify(data) : null);
        return { success: true };
      });

      // GET /api/tasks/:id/logs — retrieve crawl logs for a task
      api.get('/tasks/:id/logs', async (request, _reply) => {
        const { id } = request.params as { id: string };
        const logs = db
          .prepare('SELECT * FROM crawl_logs WHERE taskId = ? ORDER BY createdAt DESC LIMIT 200')
          .all(id);
        return logs;
      });
    },
    { prefix: '/api' },
  );

  return fastify;
}
