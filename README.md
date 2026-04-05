# Tampermonkey Crawler

Browser-based web scraping system. A Tampermonkey userscript extracts data from sites you visit, sends it to a local Fastify server, which stores raw crawl data and transforms it into useful formats.

Currently supports:
- **LinkedIn** activity feeds -- saves posts as Obsidian-compatible markdown files
- **CarMax** search results -- normalizes car listings into a SQLite table

## Quick start

```bash
npm install
make build

# Start the server (port 4242)
make dev-server
```

Then install the Tampermonkey script from `http://localhost:4242/tampermonkey.user.js` and create a mission from the dashboard at `http://localhost:4242`.

## Source layout

```
tampermonkey-crawler/
  server/                    Fastify API + SQLite + transformers
    src/
      index.ts               API routes and server setup
      db.ts                  SQLite schema (5 tables)
      crawler-definitions.ts Dashboard field definitions per site
      transformers/          Raw data -> final output
      types/                 Shared TypeScript interfaces
    public/
      index.html             Dashboard UI
  tampermonkey/              Vite-built Tampermonkey userscript
    src/
      main.user.ts           Userscript entry point
      extractors/            Pure DOM -> structured data (testable)
      sites/                 Crawl orchestration per site
      lib/progress.ts        Fire-and-forget progress logging
  docs/                      Detailed documentation
    architecture.md          Data flow, DB schema, API reference
    server.md                Server workspace internals
    tampermonkey.md          Tampermonkey workspace internals
    troubleshooting.md       Debugging guide for common failures
```

Two npm workspaces, one root `package.json`. No shared code between them -- the server and userscript communicate over HTTP.

## Commands

| Command | What it does |
|---|---|
| `make build` | Build both workspaces |
| `make dev-server` | Start server with hot reload (tsx watch) |
| `make test` | Run all tests |
| `make test-server` | Server transformer tests only |
| `make test-tampermonkey` | Tampermonkey extractor tests only (jsdom) |
| `make clean` | Remove node_modules and dist |

## Configuration

Create a `.env` file in the project root:

```
PORT=4242
OBSIDIAN_VAULT_PATH=/path/to/your/obsidian/vault
```

## Documentation

- [Architecture](docs/architecture.md) -- data flow, DB schema, API endpoints
- [Server](docs/server.md) -- routes, transformers, dashboard, config
- [Tampermonkey](docs/tampermonkey.md) -- extractors, site crawlers, progress, build
- [Troubleshooting](docs/troubleshooting.md) -- selector breakage, image failures, debugging
