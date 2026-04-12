import type { SiteCrawler } from '../index.js';
import type { TaskConfig } from '../../lib/types.js';
import type { CarMaxRawListing } from './types.js';
import { sendToServer } from '../../lib/api.js';
import {
  extractAllListings,
  matchesCarMax,
  extractVinFromHtml,
  parseSpecsApi,
  parseImageManifest,
  parseFeatures,
  CARD_SELECTOR,
} from './extractors.js';

const SCROLL_DELAY_MS = 2000;
const MAX_SEE_MORE_CLICKS = 50;

// Pacing: jittered delays to avoid uniform bot patterns.
// Images come from a CDN (img2.carmax.com) so we can be more aggressive there.
// The API calls produce natural burst patterns (same as a browser loading a detail page).
const ITEM_DELAY_MIN_MS = 200; // min pause between vehicles
const ITEM_DELAY_MAX_MS = 800; // max pause between vehicles
const IMAGE_BATCH_SIZE = 6; // concurrent image downloads (Chrome limit is 6/host)
const IMAGE_BATCH_DELAY_MS = 0; // CDN handles concurrency; network latency is the natural delay
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const MAX_BACKOFF_MS = 8_000;
const MAX_CONSECUTIVE_SERVER_ERRORS = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Add ±50% jitter to a delay value so timing looks human. */
function jitter(ms: number): number {
  return Math.round(ms * (0.5 + Math.random()));
}

/** Random delay between min and max milliseconds. */
function randomDelay(min: number, max: number): Promise<void> {
  return sleep(min + Math.random() * (max - min));
}

function fetchAsBase64(
  url: string,
  retries = MAX_RETRIES,
): Promise<{ url: string; base64: string }> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      responseType: 'arraybuffer',
      onload: async (response) => {
        if (response.status === 429 || response.status >= 500) {
          if (retries > 0) {
            const delay = Math.min(
              RETRY_BASE_MS * Math.pow(2, MAX_RETRIES - retries),
              MAX_BACKOFF_MS,
            );
            await sleep(delay);
            fetchAsBase64(url, retries - 1).then(resolve, reject);
            return;
          }
          reject(new Error(`HTTP ${response.status} after retries`));
          return;
        }
        try {
          const bytes = new Uint8Array(response.response as ArrayBuffer);
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
          }
          resolve({ url, base64: btoa(binary) });
        } catch (e) {
          reject(e);
        }
      },
      onerror: async (err) => {
        if (retries > 0) {
          const delay = Math.min(
            RETRY_BASE_MS * Math.pow(2, MAX_RETRIES - retries),
            MAX_BACKOFF_MS,
          );
          await sleep(delay);
          fetchAsBase64(url, retries - 1).then(resolve, reject);
          return;
        }
        reject(new Error(`Network error: ${JSON.stringify(err)}`));
      },
    });
  });
}

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      onload: (response) => {
        try {
          resolve(JSON.parse(response.responseText));
        } catch (e) {
          reject(e);
        }
      },
      onerror: (err) => reject(new Error(`Network error: ${JSON.stringify(err)}`)),
    });
  });
}

function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      onload: (response) => resolve(response.responseText),
      onerror: (err) => reject(new Error(`Network error: ${JSON.stringify(err)}`)),
    });
  });
}

function passesFilters(listing: CarMaxRawListing, config: TaskConfig): boolean {
  const excludePatterns = (config.excludePatterns as string[] | undefined) ?? [];
  const requirePatterns = (config.requirePatterns as string[] | undefined) ?? [];

  const titleLower = listing.title.toLowerCase();

  for (const pattern of excludePatterns) {
    if (titleLower.includes(pattern.toLowerCase())) return false;
  }

  for (const pattern of requirePatterns) {
    if (!titleLower.includes(pattern.toLowerCase())) return false;
  }

  return true;
}

async function loadMoreResults(): Promise<boolean> {
  const beforeCount = document.querySelectorAll(CARD_SELECTOR).length;

  const seeMoreBtn = [...document.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === 'See more matches',
  ) as HTMLButtonElement | undefined;

  if (!seeMoreBtn) return false;

  seeMoreBtn.click();
  await sleep(SCROLL_DELAY_MS);

  for (let i = 0; i < 5; i++) {
    if (document.querySelectorAll(CARD_SELECTOR).length > beforeCount) return true;
    await sleep(1000);
  }

  return false;
}

export const carmaxCrawler: SiteCrawler = {
  name: 'carmax',
  domain: 'carmax.com',
  match: matchesCarMax,
  run: async (task, config, progress) => {
    progress.info('Starting CarMax crawl');

    // Wait for initial results
    for (let attempt = 0; attempt < 10; attempt++) {
      if (document.querySelectorAll(CARD_SELECTOR).length > 0) break;
      progress.info('Waiting for listings to load...');
      await sleep(2000);
    }

    if (document.querySelectorAll(CARD_SELECTOR).length === 0) {
      progress.warn('No listings found on page');
      return;
    }

    // Load all pages if strategy is 'full'
    if (config.strategy === 'full') {
      let clicks = 0;
      while (clicks < MAX_SEE_MORE_CLICKS) {
        progress.info(
          `Loading more... (${document.querySelectorAll(CARD_SELECTOR).length} loaded)`,
        );
        if (!(await loadMoreResults())) break;
        clicks++;
      }
    }

    // Extract listings from search results
    const { items, errors } = extractAllListings(document);
    for (const err of errors) {
      progress.warn(`Extraction error at index ${err.index}: ${err.message}`);
    }

    // Apply client-side filters
    const filtered = items.filter((item) => passesFilters(item, config));
    const skipped = items.length - filtered.length;
    if (skipped > 0) {
      progress.info(`Filtered out ${skipped} listings (${filtered.length} remaining)`);
    }

    progress.setFound(filtered.length);
    if (filtered.length === 0) {
      progress.warn('No matching listings found');
      return;
    }

    const timestamp = new Date().toISOString();
    let consecutiveServerErrors = 0;

    for (const listing of filtered) {
      progress.info(`Processing ${listing.stockNumber}: ${listing.title}`);

      // Fetch detail data in parallel: VIN, specs, features, image manifest
      const [vinResult, specsResult, featuresResult, manifestResult] = await Promise.allSettled([
        fetchHtml(`https://www.carmax.com/car/${listing.stockNumber}`).then(extractVinFromHtml),
        fetchJson(`/car/api/specs/categorized/${listing.stockNumber}/OR`).then(parseSpecsApi),
        fetchJson(`/car/api/hotspots/${listing.stockNumber}`).then(parseFeatures),
        fetchJson(`https://img2.carmax.com/api/subject/${listing.stockNumber}`).then(
          parseImageManifest,
        ),
      ]);

      const vin = vinResult.status === 'fulfilled' ? vinResult.value : null;
      const specs = specsResult.status === 'fulfilled' ? specsResult.value : [];
      const features = featuresResult.status === 'fulfilled' ? featuresResult.value : [];
      const imageManifest = manifestResult.status === 'fulfilled' ? manifestResult.value : [];

      if (vinResult.status === 'rejected')
        progress.warn(`Failed to fetch VIN for ${listing.stockNumber}`);
      if (specsResult.status === 'rejected')
        progress.warn(`Failed to fetch specs for ${listing.stockNumber}`);

      // Download images in parallel batches with jittered delays between batches
      const imageId = vin || listing.stockNumber;
      const images: { url: string; name: string; data: string }[] = [];
      for (let i = 0; i < imageManifest.length; i += IMAGE_BATCH_SIZE) {
        if (i > 0) await sleep(jitter(IMAGE_BATCH_DELAY_MS));
        const batch = imageManifest.slice(i, i + IMAGE_BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((img) =>
            fetchAsBase64(img.thumbnailUrl).then((fetched) => ({
              url: fetched.url,
              name: `${imageId}-${img.name}`,
              data: fetched.base64,
            })),
          ),
        );
        for (const r of results) {
          if (r.status === 'fulfilled') images.push(r.value);
        }
      }

      const payload = {
        ...listing,
        vin,
        specs,
        features,
        imageManifest,
        images,
        timestamp,
      };

      try {
        await sendToServer(task.id, 'carmax', listing.stockNumber, payload);
        consecutiveServerErrors = 0;
        progress.itemSaved();
      } catch (err) {
        consecutiveServerErrors++;
        progress.itemError(`Failed to save listing ${listing.stockNumber}: ${err}`);
        if (consecutiveServerErrors >= MAX_CONSECUTIVE_SERVER_ERRORS) {
          progress.error(`Aborting — ${MAX_CONSECUTIVE_SERVER_ERRORS} consecutive server errors`);
          break;
        }
      }

      // Jittered delay between vehicles to look like human browsing
      await randomDelay(ITEM_DELAY_MIN_MS, ITEM_DELAY_MAX_MS);
    }

    progress.info(`Crawl complete. Saved ${progress.savedCount} of ${filtered.length} listings.`);
  },
};
