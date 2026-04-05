import 'dotenv/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import dotenv from 'dotenv';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import db from './db.js';
import { crawlerDefinitions } from './crawler-definitions.js';
import { transformToMarkdown } from './transformers/linkedin.js';
import { transformListing } from './transformers/carmax.js';

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

// Prepared statements for raw crawls and logs
const upsertRawCrawl = db.prepare(`
  INSERT INTO raw_crawls (taskId, site, itemKey, payload)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(taskId, itemKey) DO UPDATE SET
    payload = excluded.payload,
    status = 'pending',
    transformedAt = NULL
`);

const markRawCrawlTransformed = db.prepare(`
  UPDATE raw_crawls SET status = 'transformed', transformedAt = CURRENT_TIMESTAMP
  WHERE taskId = ? AND itemKey = ?
`);

const getRawCrawlId = db.prepare('SELECT id FROM raw_crawls WHERE taskId = ? AND itemKey = ?');

const insertCrawlLog = db.prepare(`
  INSERT INTO crawl_logs (taskId, level, message, data)
  VALUES (?, ?, ?, ?)
`);

const upsertCarListing = db.prepare(`
  INSERT INTO car_listings (
    rawCrawlId, taskId, vin, sourceUrl, sourceSite, sourceListingId,
    year, make, model, trim, mileage, price, priceCurrency, priceLabel, crawledAt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(vin, sourceSite) DO UPDATE SET
    rawCrawlId = excluded.rawCrawlId,
    sourceUrl = excluded.sourceUrl,
    mileage = excluded.mileage,
    price = excluded.price,
    priceLabel = excluded.priceLabel,
    updatedAt = CURRENT_TIMESTAMP
`);

// API Routes
fastify.register(
  async (api) => {
    // GET /api/definitions
    api.get('/definitions', async () => crawlerDefinitions);

    // GET /api/tasks/pending
    api.get('/tasks/pending', async () => {
      return db.prepare("SELECT * FROM tasks WHERE status = 'pending'").all();
    });

    // POST /api/tasks
    api.post('/tasks', async (request, reply) => {
      const { siteId, config } = request.body as { siteId: string; config: any };
      const definition = crawlerDefinitions.find((d) => d.id === siteId);
      if (!definition) return reply.status(400).send({ error: 'Invalid site' });

      const id = Math.random().toString(36).substring(7);
      const name = config.missionName || definition.name;
      const targetUrl = config.targetUrl || null;

      db.prepare(
        'INSERT INTO tasks (id, site, name, targetUrl, config) VALUES (?, ?, ?, ?, ?)',
      ).run(id, siteId, name, targetUrl, JSON.stringify(config));

      return { success: true, id };
    });

    // POST /api/collect — store raw crawl and immediately transform
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
        const config = JSON.parse(task.config || '{}');

        // Derive itemKey from payload if not provided
        if (!itemKey && site === 'linkedin' && payload?.postId) {
          itemKey = payload.postId;
        }
        if (!itemKey && site === 'carmax' && payload?.vin) {
          itemKey = payload.vin;
        }

        // Store raw crawl (upsert by taskId + itemKey)
        upsertRawCrawl.run(taskId, site, itemKey, JSON.stringify(payload));
        const rawRow = getRawCrawlId.get(taskId, itemKey) as { id: number } | undefined;
        const rawCrawlId = rawRow?.id ?? 0;

        // Site-specific transformation
        if (site === 'linkedin') {
          const vaultPath = (process.env.OBSIDIAN_VAULT_PATH || '').replace(/\/$/, '');
          if (!vaultPath || !existsSync(vaultPath)) {
            return reply.status(500).send({ error: `Obsidian Vault not found at "${vaultPath}"` });
          }
          const subPath = (config.obsidianPath || 'Unsorted').replace(/^\//, '');
          const tags = (config.tags || '')
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean);

          // Decode base64 images from payload
          const imageBuffers = (payload.images || [])
            .filter((img: any) => img.data)
            .map((img: any) => ({
              name: img.name || 'image.jpg',
              content: Buffer.from(img.data, 'base64'),
            }));

          transformToMarkdown(payload, imageBuffers, { vaultPath, subPath, tags });

          // Track last saved post for incremental crawling
          config.lastSavedPostId = payload.postId;
          db.prepare('UPDATE tasks SET config = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(
            JSON.stringify(config),
            taskId,
          );
        } else if (site === 'carmax') {
          const normalized = transformListing(
            {
              title: payload.title,
              price: payload.price,
              mileage: payload.mileage,
              link: payload.link,
              vin: payload.vin,
            },
            rawCrawlId,
            payload.timestamp || new Date().toISOString(),
          );

          upsertCarListing.run(
            rawCrawlId,
            taskId,
            normalized.vin,
            normalized.sourceUrl,
            normalized.sourceSite,
            normalized.sourceListingId,
            normalized.year,
            normalized.make,
            normalized.model,
            normalized.trim,
            normalized.mileage,
            normalized.price,
            normalized.priceCurrency,
            normalized.priceLabel,
            normalized.crawledAt,
          );

          db.prepare('UPDATE tasks SET updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(taskId);
        } else {
          // Generic: store in data table for backward compatibility
          db.prepare('INSERT INTO data (site, payload) VALUES (?, ?)').run(
            site,
            JSON.stringify(payload),
          );
          db.prepare('UPDATE tasks SET updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(taskId);
        }

        // Mark raw crawl as transformed
        if (itemKey) {
          markRawCrawlTransformed.run(taskId, itemKey);
        }

        return { success: true };
      } catch (err: any) {
        console.error('[Collect] Critical Error:', err);
        return reply.status(500).send({ error: err.message });
      }
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
