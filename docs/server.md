# Server

Fastify HTTP server with SQLite storage. Lives in `server/`.

## Source files

```
server/
  src/
    index.ts               Route handlers and server setup
    db.ts                  SQLite connection and schema creation
    crawler-definitions.ts Site configs for the dashboard form
    types/index.ts         Task, RawCrawl, CrawlLog interfaces
    transformers/
      types.ts             NormalizedCarListing, TransformResult
      linkedin.ts          Raw payload -> Obsidian markdown file
      carmax.ts            Raw listing -> normalized car data
      index.ts             Barrel exports
      __tests__/           Transformer tests (vitest, node)
  public/
    index.html             Dashboard (Tailwind via CDN, vanilla JS)
  tsconfig.json
  vitest.config.ts
```

## Routes

All API routes are registered under the `/api` prefix in `server/src/index.ts`.

The main route is `POST /api/collect`. It receives data from the Tampermonkey userscript, stores a raw crawl, and immediately transforms it. The transformation branch is selected by the `site` field in the request body.

See [docs/architecture.md](architecture.md#api-endpoints) for the full endpoint reference.

## Transformers

Transformers are pure functions in `server/src/transformers/`. They take raw crawl data and produce a final output. The server calls them during the `/api/collect` handler.

### LinkedIn (`transformers/linkedin.ts`)

`transformToMarkdown(rawPayload, imageBuffers, options)` -> file path

Takes the raw post payload, decoded image buffers, and options (`vaultPath`, `subPath`, `tags`). Writes:
- A markdown file with YAML frontmatter matching the existing hand-curated Obsidian format
- Images to an `attachments/` subdirectory

Frontmatter fields: `title`, `source`, `author`, `repostedBy`, `content_type`, `type`, `fetched`, `date`, `postId`, `description`, `tags`.

Reposts are formatted with a blockquote and attribution header. A `[View on LinkedIn]` footer is appended.

Filenames are slug-based: `2025-12-15-first-few-words-of-the-title.md`.

Only images that were successfully decoded (non-empty buffer) get written to disk and embedded in the markdown.

### CarMax (`transformers/carmax.ts`)

Three parsing helpers:
- `parseCarTitle(title)` -- splits `"2022 Toyota Sienna XLE Premium"` into `{ year, make, model, trim }`
- `parsePrice(priceStr)` -- `"$32,998"` -> `3299800` (cents)
- `parseMileage(mileageStr)` -- `"45,231 mi"` -> `45231`, handles `"12K"` -> `12000`

`transformListing(raw, rawCrawlId, timestamp)` -> `NormalizedCarListing`

The server inserts the result into the `car_listings` table with upsert on `(vin, sourceSite)`.

## Crawler definitions

`server/src/crawler-definitions.ts` defines the form fields shown in the dashboard when creating a new mission. Each definition has:
- `id` -- matches the `site` field in tasks and raw_crawls
- `name` -- display name
- `fields` -- array of `{ id, label, type, placeholder }` for the form

Currently defined: `linkedin` and `carmax`.

## Dashboard

`server/public/index.html` is a single-file dashboard using Tailwind CSS (CDN) and vanilla JavaScript. It:
- Fetches crawler definitions from `GET /api/definitions` to populate the "New Mission" form
- Polls `GET /api/tasks/pending` every 5 seconds to show active missions
- Creates tasks via `POST /api/tasks`
- Deletes all tasks via `DELETE /api/tasks`

## Database

SQLite via better-sqlite3. The database file is `crawler.db` at the project root (resolved from `server/src/db.ts` using `__dirname`).

Schema is created with `CREATE TABLE IF NOT EXISTS` on import, so the database is auto-initialized on first server start. See [docs/architecture.md](architecture.md#database-schema) for table definitions.

Prepared statements for frequent operations (upsert raw crawl, insert log, upsert car listing) are defined at module scope in `server/src/index.ts` for performance.

## Configuration

Environment variables loaded from `.env` at the project root:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4242` | Server listen port |
| `OBSIDIAN_VAULT_PATH` | (none) | Absolute path to Obsidian vault root. Required for LinkedIn transformer. |

## Testing

```bash
make test-server
```

Tests are in `server/src/transformers/__tests__/`. They test the pure transformer functions without touching the database or HTTP layer.

- `carmax.test.ts` -- parseCarTitle, parsePrice, parseMileage, transformListing
- `linkedin.test.ts` -- markdown generation, frontmatter, reposts, image embedding, slug filenames
