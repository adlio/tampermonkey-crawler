# Tampermonkey Crawler

Browser-based web scraping system. A Tampermonkey userscript extracts data from sites you visit, sends it to a local Fastify server, which stores raw crawl data and serves it via API.

This system is **only** concerned with defining crawl tasks, extracting data, and storing it efficiently. It does not transform or format data for downstream use -- that's the job of external consumers (e.g. an Obsidian plugin, a reporting dashboard, a spreadsheet export tool).

Currently supports:
- **LinkedIn** activity feeds -- extracts posts, images, metadata
- **CarMax** search results -- extracts car listings

## Quick start

```bash
npm install
make build

# Start the server (port 4242)
make dev
```

Then install the Tampermonkey script from `http://localhost:4242/tampermonkey.user.js` and create a task from the dashboard at `http://localhost:4242`.

## Source layout

```
tampermonkey-crawler/
  server/                    Fastify API + SQLite storage
    src/
      index.ts               API routes and server setup
      db.ts                  SQLite schema
      crawler-definitions.ts Dashboard field definitions per crawler
    public/
      index.html             Dashboard UI
  tampermonkey/              Vite-built Tampermonkey userscript
    src/
      main.user.ts           Userscript entry point
      crawlers/              One directory per site
        linkedin/
          extractors.ts      Pure DOM -> structured data (testable)
          index.ts           Crawl orchestration (scroll, extract, send)
          __fixtures__/      HTML snapshots for tests
          __tests__/         Extraction tests (jsdom)
        carmax/
          extractors.ts      Pure DOM -> structured data (testable)
          index.ts           Crawl orchestration
          __fixtures__/
          __tests__/
      lib/progress.ts        Fire-and-forget progress logging
  docs/                      Detailed documentation
    architecture.md          Data flow, DB schema, API reference
    server.md                Server internals
    tampermonkey.md          Tampermonkey internals
    troubleshooting.md       Debugging guide
```

Two npm workspaces, one root `package.json`. No shared code between them -- the server and userscript communicate over HTTP.

## Commands

| Command | What it does |
|---|---|
| `make build` | Build both workspaces |
| `make dev` | Start server with hot reload (tsx watch) |
| `make test` | Run all tests |
| `make test-server` | Server tests only |
| `make test-tampermonkey` | Tampermonkey extractor tests only (jsdom) |
| `make ci` | Format check + lint + build + test |
| `make clean` | Remove node_modules and dist |

## Configuration

Create a `.env` file in the project root:

```
PORT=4242
# DB_PATH=/data/crawler.db
```

## Documentation

- [Architecture](docs/architecture.md) -- data flow, DB schema, API endpoints
- [Server](docs/server.md) -- routes, storage, dashboard, config
- [Tampermonkey](docs/tampermonkey.md) -- crawlers, extractors, progress, build
- [Troubleshooting](docs/troubleshooting.md) -- selector breakage, image failures, debugging
