import type { SiteCrawler } from '../index.js';
import type { TaskConfig } from '../../lib/types.js';
import type {
  AutoTraderRawListing,
  AutoTraderVehicleDetails,
  AutoTraderVehiclePayload,
} from './types.js';
import { sendToServer } from '../../lib/api.js';
import {
  extractAllListings,
  matchesAutoTrader,
  parseDetailPageHtml,
  CARD_SELECTOR,
} from './extractors.js';

const LOAD_WAIT_MS = 2000;
const MAX_LOAD_ATTEMPTS = 10;

// Pacing: randomized delays to avoid uniform bot patterns.
const ITEM_DELAY_MIN_MS = 500;
const ITEM_DELAY_MAX_MS = 1500;
const IMAGE_BATCH_SIZE = 6; // Chrome's per-host connection limit
const MAX_SEE_MORE_CLICKS = 50; // safety cap for "See More Results" clicks
const MAX_RETRIES = 10;
const RETRY_BASE_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const MAX_CONSECUTIVE_SERVER_ERRORS = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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

// AutoTrader card titles are "2025 Rivian R1S" (no trim), so we include
// trim in the search text to allow filtering on trim-level patterns.
function passesFilters(listing: AutoTraderRawListing, config: TaskConfig): boolean {
  const excludePatterns = (config.excludePatterns as string[] | undefined) ?? [];
  const requirePatterns = (config.requirePatterns as string[] | undefined) ?? [];

  const titleLower = listing.title.toLowerCase();
  const trimLower = (listing.trim ?? '').toLowerCase();
  const searchText = `${titleLower} ${trimLower}`;

  for (const pattern of excludePatterns) {
    if (searchText.includes(pattern.toLowerCase())) return false;
  }

  for (const pattern of requirePatterns) {
    if (!searchText.includes(pattern.toLowerCase())) return false;
  }

  return true;
}

/**
 * Click "See More Results" and wait for new cards to appear.
 * Returns true if new results loaded.
 */
async function loadMoreResults(): Promise<boolean> {
  const beforeCount = document.querySelectorAll(CARD_SELECTOR).length;

  const seeMoreBtn = [...document.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === 'See More Results',
  ) as HTMLButtonElement | undefined;

  if (!seeMoreBtn) return false;

  seeMoreBtn.click();
  await sleep(LOAD_WAIT_MS);

  for (let i = 0; i < 5; i++) {
    if (document.querySelectorAll(CARD_SELECTOR).length > beforeCount) return true;
    await sleep(1000);
  }

  return false;
}

export const autotraderCrawler: SiteCrawler = {
  name: 'autotrader',
  domain: 'autotrader.com',
  match: matchesAutoTrader,
  run: async (task, config, progress) => {
    progress.info('Starting AutoTrader crawl');

    // Wait for initial results
    for (let attempt = 0; attempt < MAX_LOAD_ATTEMPTS; attempt++) {
      if (document.querySelectorAll(CARD_SELECTOR).length > 0) break;
      progress.info('Waiting for listings to load...');
      await sleep(LOAD_WAIT_MS);
    }

    if (document.querySelectorAll(CARD_SELECTOR).length === 0) {
      progress.warn('No listings found on page');
      return;
    }

    // Load all results if strategy is 'full'
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
      progress.info(`Processing ${listing.listingId}: ${listing.title} ${listing.trim ?? ''}`);

      // Fetch detail page to get VIN, full specs, features, and all images
      let details: AutoTraderVehicleDetails | null = null;
      try {
        const detailHtml = await fetchHtml(
          `https://www.autotrader.com/cars-for-sale/vehicle/${listing.listingId}`,
        );
        details = parseDetailPageHtml(detailHtml);
        if (!details) {
          progress.warn(`Failed to parse detail page for ${listing.listingId}`);
        }
      } catch (err) {
        progress.warn(`Failed to fetch detail page for ${listing.listingId}: ${err}`);
      }

      // Download images in parallel batches
      const imageId = details?.vin || listing.listingId;
      const images: { url: string; name: string; data: string }[] = [];
      const manifest = details?.imageManifest ?? [];

      for (let i = 0; i < manifest.length; i += IMAGE_BATCH_SIZE) {
        const batch = manifest.slice(i, i + IMAGE_BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((img) =>
            fetchAsBase64(img.src).then((fetched) => ({
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

      const payload: AutoTraderVehiclePayload = {
        ...listing,
        vin: details?.vin ?? null,
        stockId: details?.stockId ?? null,
        listingType: details?.listingType ?? null,
        bodyStyle: details?.bodyStyle ?? null,
        exteriorColor: details?.exteriorColor ?? null,
        exteriorColorSimple: details?.exteriorColorSimple ?? null,
        interiorColor: details?.interiorColor ?? null,
        driveType: details?.driveType ?? null,
        engine: details?.engine ?? null,
        transmission: details?.transmission ?? null,
        doors: details?.doors ?? null,
        electricVehicleRange: details?.electricVehicleRange ?? null,
        electricInfo: details?.electricInfo ?? null,
        isHot: details?.isHot ?? false,
        daysOnSite: details?.daysOnSite ?? null,
        ownerName: details?.ownerName ?? listing.dealerName,
        vhrPreview: details?.vhrPreview ?? [],
        pricingHistory: details?.pricingHistory ?? [],
        specs: details?.specs ?? [],
        imageManifest: details?.imageManifest ?? [],
        images,
        timestamp,
      };

      try {
        await sendToServer(task.id, 'autotrader', listing.listingId, payload);
        consecutiveServerErrors = 0;
        progress.itemSaved();
      } catch (err) {
        consecutiveServerErrors++;
        progress.itemError(`Failed to save listing ${listing.listingId}: ${err}`);
        if (consecutiveServerErrors >= MAX_CONSECUTIVE_SERVER_ERRORS) {
          progress.error(`Aborting — ${MAX_CONSECUTIVE_SERVER_ERRORS} consecutive server errors`);
          break;
        }
      }

      // Jittered delay between vehicles
      await randomDelay(ITEM_DELAY_MIN_MS, ITEM_DELAY_MAX_MS);
    }

    progress.info(`Crawl complete. Saved ${progress.savedCount} of ${filtered.length} listings.`);
  },
};
