# Agent Guide

Conventions and pointers for working on this codebase.

## Project structure

Two npm workspaces (`server/` and `tampermonkey/`) in a monorepo. They share no code -- communication is over HTTP on port 4242. See [docs/architecture.md](docs/architecture.md) for the full data flow.

## Key conventions

- **Conventional commits**: `feat(scope):`, `fix(scope):`, `refactor:`, `chore:`, `docs:`
- **Extractor/transformer split**: DOM parsing is in `tampermonkey/src/extractors/` (pure, testable with jsdom). Server-side output formatting is in `server/src/transformers/` (pure, testable with node). Site crawlers in `tampermonkey/src/sites/` are thin orchestration that wires extractors to network I/O.
- **Raw-then-transform**: Every collected item is stored as JSON in the `raw_crawls` table before transformation. This preserves the original data so transforms can be re-run without re-crawling.
- **Tests**: vitest for both workspaces. Tampermonkey tests use jsdom and HTML fixtures in `__fixtures__/` dirs. Server tests are pure node. Run with `make test`.
- **No shared types**: The server and tampermonkey each define their own types. The HTTP payload format is the implicit contract.

## Where to find things

| Topic | File |
|---|---|
| Data flow and DB schema | [docs/architecture.md](docs/architecture.md) |
| API endpoints | [docs/architecture.md](docs/architecture.md#api-endpoints) |
| Server routes and transformers | [docs/server.md](docs/server.md) |
| DOM extractors and site crawlers | [docs/tampermonkey.md](docs/tampermonkey.md) |
| Adding a new site | [docs/troubleshooting.md](docs/troubleshooting.md#6-adding-a-new-car-site) |
| Selector breakage and fixtures | [docs/troubleshooting.md](docs/troubleshooting.md#1-selector-breakage-most-common-issue) |
| Dashboard UI | `server/public/index.html` (single-file, Tailwind via CDN) |
| Userscript build config | `tampermonkey/vite.config.ts` (`@connect`, `@grant`, `@match`) |
| SQLite schema | `server/src/db.ts` |
| Environment variables | `.env` at project root (`PORT`, `OBSIDIAN_VAULT_PATH`) |

## Common tasks

**Adding a new site crawler**: Follow the step-by-step in [docs/troubleshooting.md, section 6](docs/troubleshooting.md#6-adding-a-new-car-site). Touches both workspaces.

**Fixing broken selectors**: Update the extractor in `tampermonkey/src/extractors/`, capture a new HTML fixture, update tests, rebuild. See [docs/troubleshooting.md, section 1](docs/troubleshooting.md#1-selector-breakage-most-common-issue).

**Adding a new transformer**: Create `server/src/transformers/<site>.ts`, add a branch in the `/api/collect` handler in `server/src/index.ts`. See [docs/server.md](docs/server.md#transformers).

**Changing the DB schema**: Edit `server/src/db.ts`. Tables are created with `CREATE TABLE IF NOT EXISTS`, so new columns require a migration or deleting `crawler.db`.
