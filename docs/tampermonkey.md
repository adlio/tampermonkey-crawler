# Tampermonkey

Vite-built Tampermonkey userscript that runs in the browser. Lives in `tampermonkey/`.

## Source files

```
tampermonkey/
  src/
    main.user.ts             Entry point: task polling, URL matching, crawl dispatch
    crawlers/
      index.ts               SiteCrawler interface + crawler registry
      linkedin/
        extractors.ts         CSS selectors + pure DOM extraction
        index.ts              Crawl orchestration (scroll, extract, fetch images, send)
        types.ts              LinkedInRawPost and related types
        __fixtures__/         HTML fixtures for jsdom tests
          linkedin-feed.html  4 posts: original, repost, text-only, malformed
        __tests__/            Extraction tests (vitest, jsdom)
          extractors.test.ts
      carmax/
        extractors.ts         Pure DOM extraction
        index.ts              Crawl orchestration
        types.ts              CarMaxRawListing and related types
        __fixtures__/
          carmax-results.html 3 car tiles: full, full, missing-fields
        __tests__/
          extractors.test.ts
    lib/
      api.ts                 BACKEND_URL, sendToServer, updateTaskConfig, fetchPendingTasks, updateTaskStatus
      progress.ts            CrawlProgress class
      types.ts               Task, TaskConfig, ExtractionResult, ExtractionError
  vite.config.ts             Userscript metadata (@connect, @grant, @match)
  vitest.config.ts           Test config (jsdom environment)
  tsconfig.json
```

## How it works

1. `main.user.ts` runs on every page load (the userscript matches `*://*/*`)
2. It fetches pending tasks from `GET /api/tasks/pending`
3. Compares the current URL against each task's `targetUrl` (normalized to strip trailing slashes, query params, etc.)
4. If a match is found, looks up the site crawler by calling `crawler.match(url)`
5. Parses task config once, creates a `CrawlProgress` instance, and calls `crawler.run(task, config, progress)`
6. Sets task status to `running` before the crawl; returns to `pending` (recurring) or `completed` (one-time) after
7. If no task matches, shows a red dot indicator with pending task count

## Crawlers

Each crawler is a self-contained directory under `tampermonkey/src/crawlers/`. A crawler has:

- `extractors.ts` -- pure functions that parse DOM into structured data. No network calls, no side effects, no `GM_xmlhttpRequest`. Testable with jsdom.
- `index.ts` -- orchestration that wires extractors to the real browser environment. Handles page waiting, scrolling, image fetching, and sending data to the server.
- `types.ts` -- TypeScript interfaces for the crawler's data shapes.
- `__fixtures__/` -- HTML snapshots of real site DOM for testing.
- `__tests__/` -- vitest tests that load fixtures with jsdom and verify extraction.

All crawlers implement the `SiteCrawler` interface:

```typescript
interface SiteCrawler {
  name: string;
  match: (url: string) => boolean;
  run: (task: Task, config: TaskConfig, progress: CrawlProgress) => Promise<void>;
}
```

Crawlers are registered in `crawlers/index.ts`. The `match` function determines which crawler handles a given URL.

### LinkedIn (`crawlers/linkedin/`)

**Extractors** (`extractors.ts`):
- `extractPost(element)` -> `LinkedInRawPost | null`
- `extractAllPosts(root)` -> `ExtractionResult<LinkedInRawPost>`
- `queryWithFallbacks(root, selectors)` -> `Element[]`
- All selector constants (`POST_SELECTORS`, `TEXT_SELECTORS`, etc.)

Selector strategy: multiple fallback selectors per data point, ordered from most stable (data attributes like `data-urn`) to least stable (generic class names). See [docs/troubleshooting.md](troubleshooting.md#which-selectors-survive-site-changes) for the durability ranking.

Image filtering: `IGNORE_IMAGE_PATTERNS` excludes profile photos, company logos, and other UI chrome from extracted `imageUrls`.

**Orchestration** (`index.ts`):
1. Waits up to 20 seconds for posts to appear (10 retries x 2s)
2. Scroll-and-save loop: extract visible posts, send each to server, scroll, repeat
3. Stops after 3 consecutive rounds with no new posts (`MAX_STALE_ROUNDS`)
4. Stops if it encounters `lastSavedItemKey` from a previous crawl (incremental)
5. Fetches content images as base64 via `GM_xmlhttpRequest` (cross-origin)
6. Sends each post individually to `POST /api/collect` with `itemKey = postId`

### CarMax (`crawlers/carmax/`)

**Extractors** (`extractors.ts`):
- `extractListing(card)` -> `CarMaxRawListing | null`
- `extractAllListings(root)` -> `ExtractionResult<CarMaxRawListing>`

Selectors: `.car-tile` container, `.car-tile--title`, `.car-tile--price`, `.car-tile--mileage`, `.car-tile--link`, `data-vin` attribute.

**Orchestration** (`index.ts`):
1. Waits 3 seconds for results to render
2. Extracts all listings at once
3. Sends each listing individually to `POST /api/collect` with `itemKey = vin`

## CrawlProgress

`tampermonkey/src/lib/progress.ts`

Fire-and-forget logging class. Every method logs to both `console.log` and `POST /api/tasks/:id/log`. Network failures are silently ignored so logging never blocks the crawl.

Tracks three counters internally: `found`, `saved`, `errors`.

Methods:
- `info(message)`, `warn(message)`, `error(message)` -- log at level
- `setFound(count)` -- update found counter
- `itemSaved()` -- increment saved, send progress log
- `itemError(message)` -- increment errors, send error log
- `progress(found, saved, errors)` -- set all counters and log

## Build

```bash
make build-tampermonkey
```

Uses Vite with `vite-plugin-monkey` to produce `tampermonkey/dist/tampermonkey.user.js`. The userscript header is generated from `vite.config.ts`:

- `@match *://*/*` -- runs on all pages
- `@grant GM_xmlhttpRequest` -- cross-origin requests
- `@connect localhost, 127.0.0.1, licdn.com` -- allowed request domains

To add a new domain for image fetching, add it to the `connect` array in `vite.config.ts`. Use bare domains without wildcards (Tampermonkey auto-covers subdomains).

After building, the script is served by the server at `http://localhost:4242/tampermonkey.user.js` for easy installation.

## Testing

```bash
make test-tampermonkey
```

Tests use vitest with a jsdom environment. HTML fixtures in `__fixtures__/` simulate real site DOM. Tests verify that extractors produce correct structured data from the fixture HTML.

When selectors break due to site changes, update the fixture HTML and extractor selectors together, then run tests. See [docs/troubleshooting.md](troubleshooting.md#8-updating-fixtures) for the full workflow.
