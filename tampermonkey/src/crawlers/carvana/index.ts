import type { SiteCrawler } from '../index.js';
import type { TaskConfig } from '../../lib/types.js';
import type { CarvanaRawListing, CarvanaVehicleDetails, CarvanaVehiclePayload } from './types.js';
import { sendToServer } from '../../lib/api.js';
import {
  extractAllListings,
  matchesCarvana,
  parseDetailPageHtml,
  CARD_SELECTOR,
} from './extractors.js';

const LOAD_WAIT_MS = 2000;
const MAX_LOAD_ATTEMPTS = 10;

// Pacing: randomized delays to avoid uniform bot patterns.
const ITEM_DELAY_MIN_MS = 500;
const ITEM_DELAY_MAX_MS = 1500;
const IMAGE_BATCH_SIZE = 6; // Chrome's per-host connection limit
const MAX_PAGES = 100; // safety cap for pagination
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

// Carvana card titles are just "2025 Rivian R1S" (no trim), so we include
// trim in the search text to allow filtering on trim-level patterns.
function passesFilters(listing: CarvanaRawListing, config: TaskConfig): boolean {
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
 * Click next page button and wait for new results to load.
 * Returns true if navigation succeeded.
 */
async function goToNextPage(): Promise<boolean> {
  const nextBtn = document.querySelector('[data-testid="next-page"]') as HTMLButtonElement | null;
  if (!nextBtn || nextBtn.disabled) return false;

  const beforeIds = new Set(
    Array.from(document.querySelectorAll(CARD_SELECTOR)).map(
      (c) => c.querySelector('a[href*="/vehicle/"]')?.getAttribute('href') ?? '',
    ),
  );

  nextBtn.click();
  await sleep(LOAD_WAIT_MS);

  // Wait for new cards to appear
  for (let i = 0; i < 5; i++) {
    const currentIds = Array.from(document.querySelectorAll(CARD_SELECTOR)).map(
      (c) => c.querySelector('a[href*="/vehicle/"]')?.getAttribute('href') ?? '',
    );
    const hasNew = currentIds.some((id) => !beforeIds.has(id));
    if (hasNew) return true;
    await sleep(1000);
  }

  return false;
}

export const carvanaCrawler: SiteCrawler = {
  name: 'carvana',
  domain: 'carvana.com',
  match: matchesCarvana,
  run: async (task, config, progress) => {
    progress.info('Starting Carvana crawl');

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

    // Collect listings across pages
    const allListings: CarvanaRawListing[] = [];
    const seenIds = new Set<string>();
    let pageNum = 1;

    const collectCurrentPage = () => {
      const { items, errors } = extractAllListings(document);
      for (const err of errors) {
        progress.warn(`Extraction error at index ${err.index}: ${err.message}`);
      }
      for (const item of items) {
        if (!seenIds.has(item.vehicleId)) {
          seenIds.add(item.vehicleId);
          allListings.push(item);
        }
      }
    };

    collectCurrentPage();

    if (config.strategy === 'full') {
      while (pageNum < MAX_PAGES) {
        progress.info(`Page ${pageNum}: ${allListings.length} listings collected so far`);
        if (!(await goToNextPage())) break;
        pageNum++;
        collectCurrentPage();
      }
    }

    // Apply client-side filters
    const filtered = allListings.filter((item) => passesFilters(item, config));
    const skipped = allListings.length - filtered.length;
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
      progress.info(`Processing ${listing.vehicleId}: ${listing.title} ${listing.trim ?? ''}`);

      // Fetch detail page to get VIN, specs, features, and images
      let details: CarvanaVehicleDetails | null = null;
      try {
        const detailHtml = await fetchHtml(`https://www.carvana.com/vehicle/${listing.vehicleId}`);
        details = parseDetailPageHtml(detailHtml);
        if (!details) {
          progress.warn(`Failed to parse detail page for ${listing.vehicleId}`);
        }
      } catch (err) {
        progress.warn(`Failed to fetch detail page for ${listing.vehicleId}: ${err}`);
      }

      // Download images in parallel batches
      const imageId = details?.vin || listing.vehicleId;
      const images: { url: string; name: string; data: string }[] = [];
      const manifest = details?.imageManifest ?? [];

      for (let i = 0; i < manifest.length; i += IMAGE_BATCH_SIZE) {
        const batch = manifest.slice(i, i + IMAGE_BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((img) =>
            fetchAsBase64(img.imageUrl).then((fetched) => ({
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

      const payload: CarvanaVehiclePayload = {
        ...listing,
        vin: details?.vin ?? null,
        stockNumber: details?.stockNumber ?? null,
        bodyType: details?.bodyType ?? null,
        exteriorColor: details?.exteriorColor ?? null,
        interiorColor: details?.interiorColor ?? null,
        drivetrain: details?.drivetrain ?? null,
        engine: details?.engine ?? null,
        transmission: details?.transmission ?? null,
        fuelType: details?.fuelType ?? null,
        horsepower: details?.horsepower ?? null,
        evRange: details?.evRange ?? null,
        seating: details?.seating ?? null,
        doors: details?.doors ?? null,
        saleStatus: details?.saleStatus ?? null,
        locationCity: details?.location?.city ?? null,
        locationState: details?.location?.state ?? null,
        specs: details?.specs ?? [],
        features: details?.features ?? [],
        imageManifest: details?.imageManifest ?? [],
        images,
        timestamp,
      };

      try {
        await sendToServer(task.id, 'carvana', listing.vehicleId, payload);
        consecutiveServerErrors = 0;
        progress.itemSaved();
      } catch (err) {
        consecutiveServerErrors++;
        progress.itemError(`Failed to save listing ${listing.vehicleId}: ${err}`);
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
