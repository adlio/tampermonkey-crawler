# Server

Fastify HTTP server with SQLite storage. Accepts raw crawl data from the Tampermonkey userscript, stores it efficiently, and exposes APIs for both the userscript and external consumers.

## Source tree

```
server/
  src/
    index.ts               Server setup, routes, static file serving
    db.ts                  SQLite schema (better-sqlite3)
    crawler-definitions.ts Dashboard form field definitions per crawler
  public/
    index.html             Dashboard UI (single-file, Tailwind via CDN)
  package.json             Workspace config (fastify, better-sqlite3, etc)
  tsconfig.json
```

## Routes

All API routes are registered under the `/api` prefix in `server/src/index.ts`.

### `POST /api/collect`
Accepts raw crawl data from the userscript. Supports both JSON and multipart/form-data (for image uploads).

Processing:
1. Parse the payload (site, taskId, itemKey, payload, images)
2. Upsert into `raw_crawls` by `(taskId, itemKey)` for deduplication
3. Hash each image, store in `blobs` table if not already present
4. Link blobs to the raw crawl via `raw_crawl_blobs`
5. Update the task's `updatedAt` timestamp

No transformation or formatting happens here -- just storage.

### `GET /api/tasks/:id/items`
Returns raw crawl items for a task. Each item includes its payload JSON and associated blob metadata.

### `GET /api/blobs/:hash`
Serves a blob by its content hash with the correct MIME type. Used by external consumers to download images.

See [docs/architecture.md](architecture.md#api-endpoints) for the full endpoint reference.

## Crawler definitions

`server/src/crawler-definitions.ts` defines the dashboard form fields for each crawler:

```ts
export const crawlerDefinitions: CrawlerDefinition[] = [
  {
    id: 'linkedin',
    name: 'LinkedIn Activity Feed',
    fields: [
      { id: 'targetUrl', label: 'Feed URL', type: 'url', ... },
      { id: 'taskName', label: 'Task Name', type: 'text', ... },
    ]
  },
  {
    id: 'carmax',
    name: 'CarMax Search Results',
    fields: [
      { id: 'targetUrl', label: 'Search URL', type: 'url', ... },
      { id: 'taskName', label: 'Task Name', type: 'text', ... },
    ]
  },
];
```

When adding a new crawler, add a definition here so the dashboard can create tasks for it.

## Dashboard

`server/public/index.html` is a single-file dashboard using Tailwind CSS (CDN) and vanilla JavaScript. It:
- Fetches crawler definitions from `GET /api/definitions` to populate the "New Task" form
- Polls `GET /api/tasks/pending` to show active tasks
- Creates tasks via `POST /api/tasks`
- Deletes all tasks via `DELETE /api/tasks`

## Storage

SQLite via better-sqlite3. The database file is `crawler.db` at the project root (created automatically).

Key design decisions:
- **Raw-first**: All crawled data is stored as JSON. This preserves the original data so it can be consumed and processed by external tools.
- **Content-addressed blobs**: Images are stored by SHA-256 hash. If the same image appears in multiple posts, only one copy is stored.
- **Deduplication**: `raw_crawls` has a unique index on `(taskId, itemKey)`. Re-crawling the same item updates the existing row rather than creating duplicates.

See [docs/architecture.md](architecture.md#database-schema) for table definitions.

## Configuration

Environment variables (via `.env` at project root):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4242` | Server listen port |
