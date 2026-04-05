# Troubleshooting

Practical guide for diagnosing and fixing common issues with the Tampermonkey crawler.

---

## 1. Selector Breakage (Most Common Issue)

LinkedIn and CarMax frequently change their CSS class names between deploys. When this happens, the crawler silently finds zero results or throws errors.

### How to diagnose

Open the browser console (F12) and look for:

- `"No posts found after waiting"` -- the crawler waited for DOM elements and none matched
- `"Tried selectors: ..."` -- tells you exactly which selectors failed
- Zero results logged with `[LinkedIn]` or `[CarMax]` prefixes

### Where selectors live

- LinkedIn: `tampermonkey/src/extractors/linkedin.ts` -- see `POST_SELECTORS`, `TEXT_SELECTORS`, `IMAGE_SELECTORS`, `ACTOR_SELECTORS`, `PERMALINK_SELECTORS`, `TIME_SELECTORS`
- CarMax: `tampermonkey/src/extractors/carmax.ts` -- uses `.car-tile`, `.car-tile--title`, `.car-tile--price`, `.car-tile--mileage`, `.car-tile--link`

### Which selectors survive site changes

Ranked from most to least durable:

1. **Data attributes** like `data-urn`, `data-vin` -- sites rarely rename these because they tie into backend logic
2. **Semantic HTML elements** like `<time>`, `<article>` -- part of the spec, not a CSS class
3. **CDN URL patterns** like `/feed/update/urn:li:activity:` in href attributes
4. **BEM-style class names** like `.feed-shared-update-v2` -- these break every few months on LinkedIn
5. **Generic class names** like `.occludable-update` -- least stable, often renamed in A/B tests

### How to capture a new fixture

1. Navigate to the page in your browser
2. Open DevTools (F12) and go to the **Elements** tab
3. Find a representative element (a post container, a car tile)
4. Right-click the element in the DOM tree and select **Copy > Copy outerHTML**
5. Paste into the appropriate fixture file (see [Updating Fixtures](#8-updating-fixtures) below)

### After updating selectors

1. Update the fixture HTML to match the new DOM structure
2. Run `make test-tampermonkey` to verify extraction works
3. Run `make build-tampermonkey` to rebuild the userscript
4. Reinstall the script in Tampermonkey (or let it auto-update from `http://localhost:4242/tampermonkey.user.js`)

---

## 2. Image Fetch Failures

### "This domain is not a part of the @connect list"

Tampermonkey blocks cross-origin requests to domains not listed in the userscript's `@connect` directive.

**Fix:** Add the domain to the `connect` array in `tampermonkey/vite.config.ts`:

```ts
connect: ['localhost', '127.0.0.1', 'licdn.com', 'newdomain.com'],
```

Use the **bare domain** without wildcards or protocol. Tampermonkey automatically covers all subdomains of a listed domain (e.g., listing `licdn.com` covers `media.licdn.com`).

After editing, rebuild with `make build-tampermonkey` and reinstall.

### Images download but appear broken

Possible causes:

- The server received a truncated response. Check server logs for write errors.
- The image URL returned a redirect or HTML error page instead of binary data. Open the URL directly in a browser tab to verify it returns an actual image.

### Profile photos / logos appearing in saved content

LinkedIn content images get mixed in with profile pictures and company logos. The `IGNORE_IMAGE_PATTERNS` array in `tampermonkey/src/sites/linkedin.ts` filters these out:

```ts
const IGNORE_IMAGE_PATTERNS = [
  /profile-displayphoto/,
  /company-logo/,
  /group-logo/,
  /shrink_(?:48|100)_/,
  /ghost-person/,
  /ghost-organization/,
];
```

If a new pattern of UI-chrome images shows up, add a regex to this array.

### Missing image embeds in saved Markdown

The server only generates `![[image]]` embeds for images that were actually saved to disk. If an image failed to download on the Tampermonkey side, it will not appear in the payload, and the server will skip the embed. Check both the browser console (for fetch errors) and the server logs (for payload inspection).

---

## 3. Server Not Receiving Data

Work through this checklist in order:

1. **Is the server running?**
   ```bash
   curl http://localhost:4242/api/tasks/pending
   ```
   You should get a JSON array back. If the connection is refused, start the server:
   ```bash
   make dev-server
   ```

2. **Does the Tampermonkey script have the right grants?**
   The userscript header must include:
   ```
   // @grant GM_xmlhttpRequest
   ```
   This is configured in `tampermonkey/vite.config.ts` under `grant`. If missing, the script cannot make cross-origin requests at all.

3. **Is `localhost` in the `@connect` list?**
   Check `tampermonkey/vite.config.ts`:
   ```ts
   connect: ['localhost', '127.0.0.1', 'licdn.com'],
   ```
   Both `localhost` and `127.0.0.1` should be listed. Without them, `GM_xmlhttpRequest` will silently fail or prompt the user.

4. **Is CORS configured?**
   The server registers `@fastify/cors` in `server/src/index.ts`:
   ```ts
   await fastify.register(cors);
   ```
   If this line is missing or the cors plugin is not installed, browser-initiated requests (from the dashboard) will fail. Note that `GM_xmlhttpRequest` bypasses CORS, but the dashboard UI does not.

5. **Check the server logs.** Fastify logs every request. Look for `[Collect]` prefixed messages. If you see the request arriving but getting a 400 or 500, the payload format is wrong.

---

## 4. Empty Extraction Results

The crawl runs but saves zero items.

### Page not fully loaded

The crawler waits for elements to appear before extracting. If the page loads slowly:

- LinkedIn: the retry loop in `tampermonkey/src/sites/linkedin.ts` tries 10 times with a 2-second delay (20 seconds total). On very slow connections, increase the attempt count or delay.
- CarMax: uses a flat 3-second `setTimeout` in `tampermonkey/src/sites/carmax.ts`. Increase this if results have not rendered yet.

### LinkedIn infinite scroll not loading

The crawler scrolls automatically using `window.scrollTo(0, document.body.scrollHeight)` and waits 2 seconds between scrolls. If no new posts appear after 3 consecutive scroll rounds (`MAX_STALE_ROUNDS`), it stops. On slow connections, you may need to increase the 2-second delay between scrolls.

### Wrong URL pattern

Each crawler has a `match()` function that checks whether it should run on the current page:

- LinkedIn: `url.includes('linkedin.com/in/') && url.includes('/recent-activity/')`
- CarMax: `url.includes('carmax.com/cars')`

If the URL does not match, the crawler will not run even if a task is pending. Verify the task's `targetUrl` aligns with these patterns. Common mistake: using `linkedin.com/feed/` instead of `linkedin.com/in/USERNAME/recent-activity/all/`.

---

## 5. Progress and Logs

### Viewing crawl logs

Logs are persisted to the `crawl_logs` table in `crawler.db`. To retrieve them:

```
GET /api/tasks/:id/logs
```

Note: this endpoint must be implemented on the server side. The `CrawlProgress` class in `tampermonkey/src/lib/progress.ts` sends logs to `POST /api/tasks/:id/log`.

### Log levels

| Level      | Meaning                                      |
|------------|----------------------------------------------|
| `info`     | Normal operation (crawl started, completed)   |
| `warn`     | Non-fatal issue (image fetch failed, skipped) |
| `error`    | Something broke (selector miss, server error) |
| `progress` | Numeric counters (found/saved/errors)         |

### Console vs. server logs

The `CrawlProgress` class writes to both `console.log` and the server. Console logs disappear when you close the tab. Server logs in `crawl_logs` persist across sessions and can be queried later for debugging.

### Using CrawlProgress

```ts
import { CrawlProgress } from '../lib/progress.js';

const progress = new CrawlProgress(task.id);
progress.info('Starting crawl');
progress.setFound(posts.length);

for (const post of posts) {
  try {
    await savePost(post);
    progress.itemSaved();
  } catch (err) {
    progress.itemError(`Failed to save post: ${err.message}`);
  }
}
```

All log calls are fire-and-forget. They will not block the crawl or throw if the server is unreachable.

---

## 6. Adding a New Car Site

Step-by-step guide for adding, say, `carvana.com`:

1. **Create the extractor** -- pure functions that parse DOM into structured data.
   ```
   tampermonkey/src/extractors/carvana.ts
   ```
   Export functions like `extractListings(doc: Document): CarListing[]`. Keep it free of side effects so it can be tested with jsdom.

2. **Create an HTML fixture and tests.**
   Save a representative chunk of the site's DOM:
   ```
   tampermonkey/src/__fixtures__/carvana-results.html
   ```
   Write tests that load this fixture with jsdom and verify the extractor returns the expected data.

3. **Create the site crawler** -- wires the extractor to task execution and progress reporting.
   ```
   tampermonkey/src/sites/carvana.ts
   ```
   Implement the `SiteCrawler` interface (`match` + `run`). Use `CrawlProgress` for logging.

4. **Register in the crawler index.**
   Edit `tampermonkey/src/sites/index.ts`:
   ```ts
   import { carvanaCrawler } from './carvana.js';

   export const crawlers: SiteCrawler[] = [
     carmaxCrawler,
     linkedinCrawler,
     carvanaCrawler,
   ];
   ```

5. **Add server-side transformer** (if needed).
   If the new site outputs car listings in a different format, create `server/src/transformers/carvana.ts`. If the payload shape matches CarMax's, you can reuse the existing transformer by mapping fields.

6. **Add crawler definition.**
   Edit `server/src/crawler-definitions.ts` and add an entry to the `crawlerDefinitions` array:
   ```ts
   {
     id: 'carvana',
     name: 'Carvana Search Results',
     fields: [
       { id: 'targetUrl', label: 'Search URL', type: 'url', placeholder: 'https://www.carvana.com/cars/...' },
       { id: 'missionName', label: 'Mission Name', type: 'text', placeholder: 'Carvana Sienna Hunt' },
     ]
   }
   ```

7. **Add domain to `@connect`.**
   Edit `tampermonkey/vite.config.ts` and add `'carvana.com'` to the `connect` array.

8. **Build, test, install.**
   ```bash
   make test
   make build
   ```
   Then reinstall the Tampermonkey script from `http://localhost:4242/tampermonkey.user.js`.

---

## 7. Running Tests

```bash
# All tests (server + tampermonkey)
make test

# Server transformer tests only
make test-server

# Tampermonkey extractor tests only (uses jsdom)
make test-tampermonkey
```

Tests use HTML fixtures stored in `__fixtures__/` directories alongside the test files. Each fixture is a chunk of real (redacted) HTML from the target site.

When a test fails after a site update, it usually means the fixture is stale. See the next section.

---

## 8. Updating Fixtures

When a site changes its DOM and selectors break, you need to capture fresh HTML.

### Step by step

1. **Navigate to the site** in your browser (logged in if required).

2. **Open DevTools** (F12) and switch to the **Elements** tab.

3. **Find the container element.** Examples:
   - LinkedIn post: look for an element with `data-urn="urn:li:activity:..."` attribute
   - CarMax car tile: look for an element with class `.car-tile` and a `data-vin` attribute

4. **Copy the HTML.** Right-click the element in the DOM tree and select **Copy > Copy outerHTML**.

5. **Paste into the fixture file.** Wrap the content in a minimal HTML document:
   ```html
   <body>
     <!-- paste the outerHTML here -->
   </body>
   ```
   For list pages, include 2-3 representative items so tests can verify the count.

6. **Redact PII.** Replace real names, emails, and profile URLs with test data. Keep the DOM structure and class names exactly as they are -- the structure is what matters, not the content.

7. **Run tests:**
   ```bash
   make test-tampermonkey
   ```

8. **If tests fail,** update the selectors in the extractor module to match the new class names or attributes. Then run tests again.

### Tips

- Capture fixtures from a **fresh page load**, not after heavy JavaScript mutation. The crawler sees the DOM after initial render, not after hours of scrolling.
- Keep fixtures **small**. One or two posts/tiles is enough. Large fixtures slow down tests and make diffs unreadable.
- Commit fixtures alongside selector changes so the git history shows what changed and why.
