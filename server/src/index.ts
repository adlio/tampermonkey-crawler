import 'dotenv/config';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
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

// API Routes
fastify.register(async (api) => {
  // GET /api/definitions
  api.get('/definitions', async () => crawlerDefinitions);

  // GET /api/tasks/pending
  api.get('/tasks/pending', async (request, reply) => {
    const pendingTasks = db.prepare("SELECT * FROM tasks WHERE status = 'pending'").all();
    return pendingTasks;
  });

  // POST /api/tasks
  api.post('/tasks', async (request, reply) => {
    const { siteId, config } = request.body as { siteId: string; config: any };
    const definition = crawlerDefinitions.find(d => d.id === siteId);
    if (!definition) return reply.status(400).send({ error: 'Invalid site' });

    const id = Math.random().toString(36).substring(7);
    const name = config.missionName || definition.name;
    const targetUrl = config.targetUrl || null;

    db.prepare("INSERT INTO tasks (id, site, name, targetUrl, config) VALUES (?, ?, ?, ?, ?)")
      .run(id, siteId, name, targetUrl, JSON.stringify(config));

    return { success: true, id };
  });

  // POST /api/collect
  api.post('/collect', async (request, reply) => {
    try {
      let payload: any = null;
      let site: string = '';
      let taskId: string = '';
      const images: { name: string; content: Buffer }[] = [];

      const contentType = request.headers['content-type'];
      console.log(`[Collect] Content-Type: ${contentType}`);
      
      if (contentType?.includes('multipart/form-data')) {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === 'file') {
            const buffer = await part.toBuffer();
            images.push({ name: part.filename, content: buffer });
            console.log(`[Collect] Received file: ${part.filename}`);
          } else {
            if (part.fieldname === 'site') site = (part.value as string);
            if (part.fieldname === 'taskId') taskId = (part.value as string);
            if (part.fieldname === 'payload') payload = JSON.parse(part.value as string);
            console.log(`[Collect] Received field: ${part.fieldname}`);
          }
        }
      } else {
        const body = request.body as any;
        site = body.site;
        taskId = body.taskId;
        payload = body.payload;
      }

      console.log(`[Collect] Processing for site: ${site}, taskId: ${taskId}`);

      if (!taskId) {
        console.error('[Collect] Missing taskId');
        return reply.status(400).send({ error: 'Missing taskId' });
      }

      const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as any;
      if (!task) {
        console.error(`[Collect] Task not found: ${taskId}`);
        return reply.status(404).send({ error: 'Task not found' });
      }
      const config = JSON.parse(task.config || '{}');

      if (site === 'linkedin') {
        let vaultPath = process.env.OBSIDIAN_VAULT_PATH || '';
        vaultPath = vaultPath.replace(/\/$/, '');

        if (!vaultPath || !existsSync(vaultPath)) {
          console.error(`[Collect] Vault path does not exist: "${vaultPath}"`);
          return reply.status(500).send({ error: `Obsidian Vault not found at "${vaultPath}"` });
        }

        const subPath = (config.obsidianPath || 'Unsorted').replace(/^\//, '');
        const outputDir = join(vaultPath, subPath);
        const resourceDir = join(outputDir, 'attachments');

        console.log(`[Collect] Ensuring directories exist: ${outputDir}`);
        mkdirSync(outputDir, { recursive: true });
        mkdirSync(resourceDir, { recursive: true });

        // Handle images from multipart uploads or base64-encoded JSON payload
        const imageBuffers: { name: string; content: Buffer }[] = [];
        if (images.length > 0) {
          imageBuffers.push(...images);
        } else if (payload.images) {
          for (const img of payload.images) {
            if (img.data) {
              imageBuffers.push({
                name: img.name || 'image.jpg',
                content: Buffer.from(img.data, 'base64'),
              });
            }
          }
        }

        // Only write images that actually have content
        const savedImageNames: Set<string> = new Set();
        imageBuffers.forEach(img => {
          writeFileSync(join(resourceDir, img.name), img.content);
          savedImageNames.add(img.name);
        });

        // Build slug-based filename like: 2025-12-20-first-few-words.md
        const postDate = payload.postDate
          ? new Date(payload.postDate)
          : new Date(payload.timestamp);
        const dateStr = postDate.toISOString().split('T')[0];
        const slug = (payload.title || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 60)
          .replace(/-$/, '');
        const fileName = slug ? `${dateStr}-${slug}.md` : `${dateStr}-${payload.postId.replace(/[^a-z0-9]/gi, '-')}.md`;

        const isRepost = !!payload.repostedBy;
        const tags = (config.tags || '')
          .split(',')
          .map((t: string) => t.trim())
          .filter(Boolean);

        // Frontmatter matching the existing hand-curated format
        let frontmatter = `---\n`;
        frontmatter += `title: "${(payload.title || '').replace(/"/g, '\\"')}"\n`;
        frontmatter += `source: "${payload.postUrl || ''}"\n`;
        if (payload.author) frontmatter += `author: "${payload.author}"\n`;
        if (isRepost) frontmatter += `repostedBy: "${payload.repostedBy}"\n`;
        frontmatter += `content_type: linkedin-post\n`;
        frontmatter += `type: ${isRepost ? 'repost' : 'original'}\n`;
        frontmatter += `fetched: ${new Date(payload.timestamp).toISOString().split('T')[0]}\n`;
        if (payload.postDate) frontmatter += `date: ${dateStr}\n`;
        frontmatter += `postId: ${payload.postId}\n`;
        frontmatter += `description: ""\n`;
        if (tags.length > 0) {
          frontmatter += `tags:\n`;
          tags.forEach((tag: string) => { frontmatter += `  - "${tag}"\n`; });
        }
        frontmatter += `---\n`;

        // Only reference images that were actually saved to disk
        const imageEmbeds: string[] = (payload.images || [])
          .filter((img: any) => savedImageNames.has(img.name))
          .map((img: any) => `![[${img.name}]]`);

        let content = frontmatter + '\n';

        if (isRepost) {
          content += `**${payload.repostedBy}** reposted from **${payload.author || 'unknown'}**:\n\n`;
          content += `> ${payload.text.replace(/\n/g, '\n> ')}\n`;
          if (imageEmbeds.length > 0) {
            content += `>\n`;
            imageEmbeds.forEach((embed: string) => { content += `> ${embed}\n`; });
          }
        } else {
          content += `${payload.text}\n`;
          if (imageEmbeds.length > 0) {
            content += `\n`;
            imageEmbeds.forEach((embed: string) => { content += `${embed}\n`; });
          }
        }

        content += `\n---\n[View on LinkedIn](${payload.postUrl || ''})\n`;

        writeFileSync(join(outputDir, fileName), content);

        config.lastSavedPostId = payload.postId;
        db.prepare("UPDATE tasks SET config = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?")
          .run(JSON.stringify(config), taskId);
      } else {
        const tableName = config.tableName || 'data';
        db.prepare(`INSERT INTO data (site, payload) VALUES (?, ?)`).run(site, JSON.stringify(payload));
        db.prepare("UPDATE tasks SET updatedAt = CURRENT_TIMESTAMP WHERE id = ?").run(taskId);
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
    db.prepare("UPDATE tasks SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?").run(status, id);
    return { success: true };
  });

  // DELETE /api/tasks
  api.delete('/tasks', async (request, reply) => {
    db.prepare("DELETE FROM tasks").run();
    return { success: true };
  });
}, { prefix: '/api' });

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
