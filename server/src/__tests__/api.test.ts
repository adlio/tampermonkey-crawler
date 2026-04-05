import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDatabase } from '../db.js';
import { buildApp } from '../app.js';
import type Database from 'better-sqlite3';

let app: FastifyInstance;
let db: Database.Database;

beforeEach(async () => {
  db = createDatabase(); // in-memory
  app = await buildApp(db);
});

afterEach(async () => {
  await app.close();
  db.close();
});

// Helper to create a task and return its id
async function createTask(overrides: Record<string, unknown> = {}): Promise<string> {
  const resp = await app.inject({
    method: 'POST',
    url: '/api/tasks',
    payload: {
      siteId: 'carmax',
      config: {
        targetUrl: 'https://www.carmax.com/cars/toyota',
        taskName: 'Test Task',
        ...overrides,
      },
    },
  });
  return resp.json().id;
}

// ---------------------------------------------------------------------------
// GET /api/definitions
// ---------------------------------------------------------------------------
describe('GET /api/definitions', () => {
  it('returns crawler definitions', async () => {
    const resp = await app.inject({ method: 'GET', url: '/api/definitions' });
    expect(resp.statusCode).toBe(200);
    const defs = resp.json();
    expect(Array.isArray(defs)).toBe(true);
    expect(defs.length).toBeGreaterThan(0);
    expect(defs.find((d: any) => d.id === 'linkedin')).toBeTruthy();
    expect(defs.find((d: any) => d.id === 'carmax')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// POST /api/tasks + GET /api/tasks + GET /api/tasks/pending
// ---------------------------------------------------------------------------
describe('task CRUD', () => {
  it('creates a task and returns it in the list', async () => {
    const createResp = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        siteId: 'carmax',
        config: { targetUrl: 'https://www.carmax.com/cars/toyota', taskName: 'Sienna Hunt' },
      },
    });
    expect(createResp.statusCode).toBe(200);
    const { success, id } = createResp.json();
    expect(success).toBe(true);
    expect(id).toBeTruthy();

    const listResp = await app.inject({ method: 'GET', url: '/api/tasks' });
    const tasks = listResp.json();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe(id);
    expect(tasks[0].name).toBe('Sienna Hunt');
    expect(tasks[0].site).toBe('carmax');
    expect(tasks[0].targetUrl).toBe('https://www.carmax.com/cars/toyota');
    expect(tasks[0].status).toBe('pending');
  });

  it('derives targetUrl for LinkedIn from profileId', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        siteId: 'linkedin',
        config: { profileId: 'simonwardley', taskName: 'Wardley Posts' },
      },
    });
    const { id } = resp.json();

    const tasks = (await app.inject({ method: 'GET', url: '/api/tasks' })).json();
    const task = tasks.find((t: any) => t.id === id);
    expect(task.targetUrl).toBe('https://www.linkedin.com/in/simonwardley/recent-activity/all/');
  });

  it('uses definition name when taskName is not provided', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { siteId: 'carmax', config: { targetUrl: 'https://www.carmax.com/cars/toyota' } },
    });
    const { id } = resp.json();

    const tasks = (await app.inject({ method: 'GET', url: '/api/tasks' })).json();
    expect(tasks.find((t: any) => t.id === id).name).toBe('CarMax Search Results');
  });

  it('rejects invalid siteId', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { siteId: 'nonexistent', config: {} },
    });
    expect(resp.statusCode).toBe(400);
    expect(resp.json().error).toBe('Invalid site');
  });

  it('GET /api/tasks/pending only returns pending tasks', async () => {
    const id = await createTask();

    // Mark as completed
    await app.inject({
      method: 'POST',
      url: `/api/tasks/${id}/status`,
      payload: { status: 'completed' },
    });

    const pending = (await app.inject({ method: 'GET', url: '/api/tasks/pending' })).json();
    expect(pending).toHaveLength(0);

    const all = (await app.inject({ method: 'GET', url: '/api/tasks' })).json();
    expect(all).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// POST /api/tasks/:id/status
// ---------------------------------------------------------------------------
describe('POST /api/tasks/:id/status', () => {
  it('updates task status', async () => {
    const id = await createTask();

    const resp = await app.inject({
      method: 'POST',
      url: `/api/tasks/${id}/status`,
      payload: { status: 'running' },
    });
    expect(resp.statusCode).toBe(200);

    const tasks = (await app.inject({ method: 'GET', url: '/api/tasks' })).json();
    expect(tasks[0].status).toBe('running');
  });

  it('rejects invalid status', async () => {
    const id = await createTask();
    const resp = await app.inject({
      method: 'POST',
      url: `/api/tasks/${id}/status`,
      payload: { status: 'bogus' },
    });
    expect(resp.statusCode).toBe(400);
    expect(resp.json().error).toBe('Invalid status');
  });
});

// ---------------------------------------------------------------------------
// POST /api/tasks/:id/config
// ---------------------------------------------------------------------------
describe('POST /api/tasks/:id/config', () => {
  it('merges fields into existing config', async () => {
    const id = await createTask();

    await app.inject({
      method: 'POST',
      url: `/api/tasks/${id}/config`,
      payload: { lastSavedItemKey: 'post-123' },
    });

    const tasks = (await app.inject({ method: 'GET', url: '/api/tasks' })).json();
    const config = JSON.parse(tasks[0].config);
    expect(config.lastSavedItemKey).toBe('post-123');
    // Original fields preserved
    expect(config.targetUrl).toBe('https://www.carmax.com/cars/toyota');
  });
});

// ---------------------------------------------------------------------------
// POST /api/collect + GET /api/tasks/:id/items
// ---------------------------------------------------------------------------
describe('POST /api/collect', () => {
  it('stores a raw crawl item and retrieves it', async () => {
    const taskId = await createTask();

    const collectResp = await app.inject({
      method: 'POST',
      url: '/api/collect',
      payload: {
        site: 'carmax',
        taskId,
        itemKey: 'vin-123',
        payload: { title: 'Toyota Sienna', price: '$30,000' },
      },
    });
    expect(collectResp.statusCode).toBe(200);
    expect(collectResp.json().success).toBe(true);

    const itemsResp = await app.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/items`,
    });
    const items = itemsResp.json();
    expect(items).toHaveLength(1);
    expect(items[0].itemKey).toBe('vin-123');
    const payload = JSON.parse(items[0].payload);
    expect(payload.title).toBe('Toyota Sienna');
  });

  it('upserts on duplicate (taskId, itemKey)', async () => {
    const taskId = await createTask();

    await app.inject({
      method: 'POST',
      url: '/api/collect',
      payload: { site: 'carmax', taskId, itemKey: 'vin-123', payload: { price: '$30,000' } },
    });
    await app.inject({
      method: 'POST',
      url: '/api/collect',
      payload: { site: 'carmax', taskId, itemKey: 'vin-123', payload: { price: '$28,000' } },
    });

    const items = (await app.inject({ method: 'GET', url: `/api/tasks/${taskId}/items` })).json();
    expect(items).toHaveLength(1);
    expect(JSON.parse(items[0].payload).price).toBe('$28,000');
  });

  it('rejects missing taskId', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/api/collect',
      payload: { site: 'carmax', payload: { title: 'test' } },
    });
    expect(resp.statusCode).toBe(400);
  });

  it('rejects unknown taskId', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/api/collect',
      payload: { site: 'carmax', taskId: 'nonexistent', itemKey: 'x', payload: {} },
    });
    expect(resp.statusCode).toBe(404);
  });

  it('stores images as content-addressed blobs', async () => {
    const taskId = await createTask();

    // A tiny 1x1 red PNG as base64
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    await app.inject({
      method: 'POST',
      url: '/api/collect',
      payload: {
        site: 'carmax',
        taskId,
        itemKey: 'vin-456',
        payload: {
          title: 'With Image',
          images: [{ name: 'photo.png', data: pngBase64 }],
        },
      },
    });

    // Verify blob was stored
    const blobs = db.prepare('SELECT hash, mimeType, size FROM blobs').all() as any[];
    expect(blobs).toHaveLength(1);
    expect(blobs[0].mimeType).toBe('image/png');
    expect(blobs[0].size).toBeGreaterThan(0);

    // Verify blob is retrievable via API
    const blobResp = await app.inject({
      method: 'GET',
      url: `/api/blobs/${blobs[0].hash}`,
    });
    expect(blobResp.statusCode).toBe(200);
    expect(blobResp.headers['content-type']).toBe('image/png');

    // Verify link table
    const links = db.prepare('SELECT * FROM raw_crawl_blobs').all() as any[];
    expect(links).toHaveLength(1);
    expect(links[0].name).toBe('photo.png');
    expect(links[0].role).toBe('content-image');
  });

  it('accepts multipart/form-data with file uploads', async () => {
    const taskId = await createTask();

    // 1x1 red PNG
    const pngBuf = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64',
    );

    const boundary = '----TestBoundary123';
    const parts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="site"\r\n\r\ncarmax`,
      `--${boundary}\r\nContent-Disposition: form-data; name="taskId"\r\n\r\n${taskId}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="itemKey"\r\n\r\nvin-multi`,
      `--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n${JSON.stringify({ title: 'Multipart Car' })}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="car.png"\r\nContent-Type: image/png\r\n\r\n`,
    ];

    const body = Buffer.concat([
      Buffer.from(parts.join('\r\n') + '\r\n'),
      pngBuf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const resp = await app.inject({
      method: 'POST',
      url: '/api/collect',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(resp.statusCode).toBe(200);
    expect(resp.json().success).toBe(true);

    // Verify the item was stored with images attached by the multipart handler
    const items = (await app.inject({ method: 'GET', url: `/api/tasks/${taskId}/items` })).json();
    expect(items).toHaveLength(1);
    const payload = JSON.parse(items[0].payload);
    expect(payload.title).toBe('Multipart Car');
    expect(payload.images).toHaveLength(1);
    expect(payload.images[0].name).toBe('car.png');

    // Verify blob was stored
    const blobs = db.prepare('SELECT hash, mimeType FROM blobs').all() as any[];
    expect(blobs).toHaveLength(1);
    expect(blobs[0].mimeType).toBe('image/png');
  });

  it('deduplicates identical blobs', async () => {
    const taskId = await createTask();
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    // Send same image on two different items
    await app.inject({
      method: 'POST',
      url: '/api/collect',
      payload: {
        site: 'carmax',
        taskId,
        itemKey: 'vin-1',
        payload: { images: [{ name: 'a.png', data: pngBase64 }] },
      },
    });
    await app.inject({
      method: 'POST',
      url: '/api/collect',
      payload: {
        site: 'carmax',
        taskId,
        itemKey: 'vin-2',
        payload: { images: [{ name: 'b.png', data: pngBase64 }] },
      },
    });

    // Only one blob row, but two link rows
    const blobs = db.prepare('SELECT * FROM blobs').all();
    expect(blobs).toHaveLength(1);
    const links = db.prepare('SELECT * FROM raw_crawl_blobs').all();
    expect(links).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// GET /api/blobs/:hash
// ---------------------------------------------------------------------------
describe('GET /api/blobs/:hash', () => {
  it('returns 404 for unknown hash', async () => {
    const resp = await app.inject({
      method: 'GET',
      url: '/api/blobs/deadbeef',
    });
    expect(resp.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/tasks/:id/log + GET /api/tasks/:id/logs
// ---------------------------------------------------------------------------
describe('crawl logs', () => {
  it('stores and retrieves log entries', async () => {
    const taskId = await createTask();

    await app.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/log`,
      payload: { level: 'info', message: 'Starting crawl' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/log`,
      payload: { level: 'error', message: 'Something broke', data: { found: 5 } },
    });

    const logsResp = await app.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/logs`,
    });
    const logs = logsResp.json();
    expect(logs).toHaveLength(2);
    const levels = logs.map((l: any) => l.level).sort();
    expect(levels).toEqual(['error', 'info']);
    const errorLog = logs.find((l: any) => l.level === 'error');
    expect(errorLog.message).toBe('Something broke');
    expect(JSON.parse(errorLog.data)).toEqual({ found: 5 });
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/tasks
// ---------------------------------------------------------------------------
describe('DELETE /api/tasks', () => {
  it('deletes all tasks', async () => {
    await createTask();
    await createTask();

    const before = (await app.inject({ method: 'GET', url: '/api/tasks' })).json();
    expect(before).toHaveLength(2);

    const delResp = await app.inject({ method: 'DELETE', url: '/api/tasks' });
    expect(delResp.statusCode).toBe(200);

    const after = (await app.inject({ method: 'GET', url: '/api/tasks' })).json();
    expect(after).toHaveLength(0);
  });
});
