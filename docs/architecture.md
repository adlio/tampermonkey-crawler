# Architecture

## Data flow

```
Browser (Tampermonkey)                     Server (Fastify + SQLite)
========================                   ========================

1. User creates a task             -->     Task stored in `tasks` table
   from the dashboard

2. Userscript polls                <--     GET /api/tasks/pending
   /api/tasks/pending

3. URL matches a crawler?
   Yes --> run the crawler
     - Extract data from DOM
     - Fetch images via GM_xmlhttpRequest
     - Send each item to server   -->     POST /api/collect
                                           - Store raw JSON in `raw_crawls`
                                           - Store media blobs by content hash
     - Report progress            -->     POST /api/tasks/:id/log
                                           - Store in `crawl_logs`

4. External consumers             <--     GET /api/tasks/:id/items
   retrieve data via API                  GET /api/blobs/:hash
```

The system boundary is clear: this project extracts and stores raw data. It does NOT transform data into downstream formats (markdown files, normalized database tables, etc). External applications consume the APIs to pull data and do their own processing.

## Workspaces

### `server/`
Fastify HTTP server with SQLite storage. Responsibilities:
- Serve the dashboard UI for creating and monitoring tasks
- Serve the built Tampermonkey userscript
- Accept raw crawl data from the userscript
- Store raw data and media blobs efficiently (content-addressed dedup)
- Expose APIs for external consumers to retrieve stored data

### `tampermonkey/`
Vite-built Tampermonkey userscript. Responsibilities:
- Poll the server for pending tasks
- Match the current browser URL to a registered crawler
- Run the crawler: extract DOM data, fetch images, send everything to the server
- Report progress and errors via fire-and-forget logging

## Database schema

SQLite file at `crawler.db` in the project root. Schema is auto-created on first run.

### `tasks`
Crawl task definitions created from the dashboard. Tasks stay in `pending` status and are reusable -- the Tampermonkey script sets them to `running` during a crawl, then returns them to `pending` when done.

The `config` JSON includes crawler-specific fields plus common scheduling fields:
- `strategy` — crawl scope (`full`, `latest`, `date-range`)
- `runMode` — `recurring` (returns to pending after each crawl) or `once` (moves to completed)
- `recrawlIntervalHours` — minimum hours between recurring crawls
- `lastSavedItemKey` — bookmark set by the crawler for incremental runs

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | Random alphanumeric |
| site | TEXT | Crawler ID (e.g. `linkedin`, `carmax`) |
| name | TEXT | Human-readable task name |
| targetUrl | TEXT | URL pattern the userscript matches against |
| status | TEXT | `pending`, `running`, `completed`, `failed` |
| config | TEXT | JSON string of crawler-specific fields |
| createdAt | DATETIME | |
| updatedAt | DATETIME | |

### `raw_crawls`
Raw extracted data, one row per item per task. Deduped by `(taskId, itemKey)`.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| taskId | TEXT | FK to tasks.id |
| site | TEXT | Crawler ID |
| itemKey | TEXT | Unique key within the task (post ID, VIN, etc) |
| payload | TEXT | Full JSON payload from the crawler |
| createdAt | DATETIME | |

### `blobs`
Content-addressed binary storage for images and other media.

| Column | Type | Notes |
|---|---|---|
| hash | TEXT PK | SHA-256 hex digest of the content |
| data | BLOB | Binary content |
| mimeType | TEXT | e.g. `image/jpeg` |
| size | INTEGER | Byte count |
| createdAt | DATETIME | |

### `raw_crawl_blobs`
Join table linking raw crawl items to their associated blobs.

| Column | Type | Notes |
|---|---|---|
| rawCrawlId | INTEGER | FK to raw_crawls.id |
| blobHash | TEXT | FK to blobs.hash |
| name | TEXT | Original filename or label |
| role | TEXT | e.g. `content-image`, `thumbnail` |

### `crawl_logs`
Progress and event log for crawl sessions.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| taskId | TEXT | FK to tasks.id |
| level | TEXT | `info`, `warn`, `error`, `progress` |
| message | TEXT | Human-readable log message |
| data | TEXT | Optional JSON with counters or context |
| createdAt | DATETIME | |

## API endpoints

### Task management

| Method | Path | Description |
|---|---|---|
| GET | `/api/definitions` | List crawler definitions (fields for the dashboard form) |
| GET | `/api/tasks` | List all tasks (dashboard) |
| GET | `/api/tasks/pending` | List tasks with status `pending` (userscript) |
| POST | `/api/tasks` | Create a new task |
| POST | `/api/tasks/:id/status` | Update task status |
| POST | `/api/tasks/:id/config` | Merge fields into task config |
| DELETE | `/api/tasks` | Delete all tasks |

### Data collection (called by Tampermonkey)

| Method | Path | Description |
|---|---|---|
| POST | `/api/collect` | Store a raw crawl item + media blobs |
| POST | `/api/tasks/:id/log` | Append a log entry |

### Data retrieval (called by external consumers)

| Method | Path | Description |
|---|---|---|
| GET | `/api/tasks/:id/items` | List raw crawl items for a task |
| GET | `/api/tasks/:id/logs` | List crawl logs for a task |
| GET | `/api/blobs/:hash` | Download a blob by content hash |

### Static files

| Method | Path | Description |
|---|---|---|
| GET | `/` | Dashboard UI |
| GET | `/tampermonkey.user.js` | Built userscript for installation |
