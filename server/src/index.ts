import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fastifyStatic from '@fastify/static';
import { createDatabase } from './db.js';
import { buildApp } from './app.js';
import { MediaStore } from './media-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

const dataDir = process.env.DATA_DIR || resolve(__dirname, '../../data');
const mediaStore = new MediaStore(dataDir);
mediaStore.ensureDir();

const db = createDatabase(resolve(dataDir, 'crawler.db'));
const fastify = await buildApp(db, mediaStore);

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

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '4242');
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Server is running on http://localhost:${port}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();
