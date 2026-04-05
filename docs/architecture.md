# Architecture

## Data flow

```
Browser DOM
  |
  v
Extractors (tampermonkey/src/extractors/)
  Pure functions: DOM Element -> structured data
  Testable with jsdom, no side effects
  |
  v
Site Crawlers (tampermonkey/src/sites/)
  Orchestration: wait for page load, scroll, fetch images, send to server
  Uses CrawlProgress for fire-and-forget logging
  |
  v  HTTP POST /api/collect
  |
  v
Server stores raw JSON in raw_crawls table
  Deduplication by (taskId, itemKey)
  Preserves original payload for re-transformation
  |
  v
Transformers (server/src/transformers/)
  Pure functions: raw JSON -> final output
  Called immediately after raw storage
  |
  v
Output
  LinkedIn: Obsidian markdown files with YAML frontmatter + images
  CarMax: normalized rows in car_listings table
```

Each layer is independently testable. Extractors and transformers are pure functions. Side effects (network, file I/O, scrolling) live only in the site crawlers and server route handlers.

## Workspaces

### `server/`

Fastify HTTP server with SQLite (better-sqlite3). Receives data from the Tampermonkey userscript, stores it, transforms it. Also serves the dashboard UI and the built userscript file.

Runtime: Node.js. Built with `tsc`. Dev mode via `tsx watch`.

See [docs/server.md](server.md) for details.

### `tampermonkey/`

Tampermonkey userscript built with Vite + vite-plugin-monkey. Runs in the browser on every page. Checks for pending tasks, matches URLs, runs the appropriate site crawler.

Runtime: Browser (via Tampermonkey). Built with `vite build`. Output is a single `tampermonkey.user.js` file.

See [docs/tampermonkey.md](tampermonkey.md) for details.

## Database schema

SQLite file at `crawler.db` in the project root (resolved via `__dirname` from `server/src/db.ts`). Schema is auto-created on first run.

### tasks

Missions created from the dashboard. Tasks stay in `pending` status and are reusable -- the Tampermonkey script sets them to `running` during a crawl, then returns them to `pending` when done.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | Random alphanumeric |
| site | TEXT | Crawler ID (`linkedin`, `carmax`) |
| name | TEXT | Display name for dashboard |
| targetUrl | TEXT | URL the userscript matches against |
| status | TEXT | `pending`, `running`, `completed`, `failed` |
| config | TEXT | JSON string with site-specific settings |
| createdAt | DATETIME | Auto |
| updatedAt | DATETIME | Auto |

### raw_crawls

Every item collected by the userscript is stored here before transformation. The full payload (including base64 image data for LinkedIn) is preserved so transforms can be re-run.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| taskId | TEXT | FK to tasks.id |
| site | TEXT | Crawler ID |
| itemKey | TEXT | Dedup key (postId for LinkedIn, VIN for CarMax) |
| payload | TEXT | Full JSON payload from userscript |
| status | TEXT | `pending`, `transformed`, `failed` |
| createdAt | DATETIME | Auto |
| transformedAt | DATETIME | Set when transformer runs |

Unique index on `(taskId, itemKey)` -- re-crawling the same item upserts.

### crawl_logs

Progress and error events sent by the `CrawlProgress` class during a crawl session.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| taskId | TEXT | FK to tasks.id |
| level | TEXT | `info`, `warn`, `error`, `progress` |
| message | TEXT | Human-readable log message |
| data | TEXT | Optional JSON with counters or context |
| createdAt | DATETIME | Auto |

### car_listings

Normalized car data produced by the CarMax transformer. One row per vehicle. Designed to support multiple car sites -- the `sourceSite` column distinguishes origin.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| rawCrawlId | INTEGER | FK to raw_crawls.id |
| taskId | TEXT | FK to tasks.id |
| vin | TEXT | Vehicle identification number |
| sourceSite | TEXT | `carmax`, `carvana`, etc. |
| sourceUrl | TEXT | Link to the listing |
| year | INTEGER | |
| make | TEXT | e.g. `Toyota` |
| model | TEXT | e.g. `Sienna` |
| trim | TEXT | e.g. `XLE Premium` |
| price | INTEGER | Cents (e.g. 3299800 = $32,998) |
| priceCurrency | TEXT | Default `USD` |
| priceLabel | TEXT | Original string e.g. `$32,998` |
| mileage | INTEGER | Miles |

Unique index on `(vin, sourceSite)` -- re-crawling the same car upserts.

Full column list including `bodyStyle`, `drivetrain`, `transmission`, `engine`, `fuelType`, `condition`, `exteriorColor`, `interiorColor`, `imageUrls`, `thumbnailUrl` is in `server/src/db.ts`.

### data

Legacy generic storage table. Used as fallback when a site has no dedicated transformer.

## API endpoints

All under the `/api` prefix. Server runs on port 4242 by default.

### Tasks

| Method | Path | Description |
|---|---|---|
| GET | `/api/definitions` | Crawler definitions for the dashboard form |
| GET | `/api/tasks/pending` | All tasks with status `pending` |
| POST | `/api/tasks` | Create a new task. Body: `{ siteId, config }` |
| POST | `/api/tasks/:id/status` | Update task status. Body: `{ status }` |
| DELETE | `/api/tasks` | Delete all tasks |

### Data collection

| Method | Path | Description |
|---|---|---|
| POST | `/api/collect` | Store raw crawl and transform. Body: `{ site, taskId, itemKey, payload }` |

The collect endpoint:
1. Stores the payload in `raw_crawls` (upsert by taskId + itemKey)
2. Runs the site-specific transformer immediately
3. Marks the raw_crawl as `transformed`

### Logging

| Method | Path | Description |
|---|---|---|
| POST | `/api/tasks/:id/log` | Store a crawl log entry. Body: `{ level, message, data }` |
| GET | `/api/tasks/:id/logs` | Retrieve crawl logs (most recent 200) |

### Static files

| Path | Description |
|---|---|
| `/` | Dashboard UI (`server/public/index.html`) |
| `/tampermonkey.user.js` | Built userscript for Tampermonkey installation |
| `/dist/*` | Tampermonkey dist directory |
