import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash, randomUUID } from 'crypto';
import dotenv from 'dotenv';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import db from './db.js';
import { crawlerDefinitions } from './crawler-definitions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

const fastify = Fastify({
  logger: true,
});

await fastify.register(cors);
await fastify.register(multipart);

// Dashboard (Static UI)
await fastify.register(fastifyStatic, {
  root: resolve(__dirname, '../public'),
  prefix: '/',
});

// Built Tampermonkey script
const tampermonkeyDist = resolve(__dirname, '../../tampermonkey/dist');
await fastify.register(fastifyStatic, {
  root: tampermonkeyDist,
  prefix: '/dist/',
  decorateReply: false,
});

// GET /tampermonkey.user.js
fastify.get('/tampermonkey.user.js', async (request, reply) => {
  return reply.sendFile('tampermonkey.user.js', tampermonkeyDist);
});

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

const insertBlob = db.prepare(`
  INSERT OR IGNORE INTO blobs (hash, data, mimeType, size)
  VALUES (?, ?, ?, ?)
`);

const linkBlob = db.prepare(`
  INSERT OR IGNORE INTO raw_crawl_blobs (rawCrawlId, blobHash, name, role)
  VALUES (?, ?, ?, ?)
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

    // GET /api/tasks/pending — only pending tasks (for the userscript)
    api.get('/tasks/pending', async () => {
      return db.prepare("SELECT * FROM tasks WHERE status = 'pending'").all();
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

    // POST /api/collect — store raw crawl data and blobs
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

        // Store raw crawl (upsert by taskId + itemKey)
        upsertRawCrawl.run(taskId, site, itemKey, JSON.stringify(payload));

        // Process images into content-addressed blob storage
        const rawRow = db
          .prepare('SELECT id FROM raw_crawls WHERE taskId = ? AND itemKey = ?')
          .get(taskId, itemKey) as { id: number } | undefined;
        const rawCrawlId = rawRow?.id;

        if (rawCrawlId && payload?.images) {
          for (const img of payload.images) {
            if (!img.data) continue;
            const buffer = Buffer.from(img.data, 'base64');
            const hash = createHash('sha256').update(buffer).digest('hex');
            const mimeType = img.name?.endsWith('.png') ? 'image/png' : 'image/jpeg';
            insertBlob.run(hash, buffer, mimeType, buffer.length);
            linkBlob.run(rawCrawlId, hash, img.name || 'image.jpg', 'content-image');
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

    // GET /api/blobs/:hash -- serve a blob by content hash
    api.get('/blobs/:hash', async (request, reply) => {
      const { hash } = request.params as { hash: string };
      const blob = db.prepare('SELECT data, mimeType FROM blobs WHERE hash = ?').get(hash) as
        | { data: Buffer; mimeType: string }
        | undefined;
      if (!blob) return reply.status(404).send({ error: 'Blob not found' });
      return reply.type(blob.mimeType).send(blob.data);
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

    // DELETE /api/tasks
    api.delete('/tasks', async (_request, _reply) => {
      db.prepare('DELETE FROM tasks').run();
      return { success: true };
    });
  },
  { prefix: '/api' },
);

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '4242');
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Server is running on http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
