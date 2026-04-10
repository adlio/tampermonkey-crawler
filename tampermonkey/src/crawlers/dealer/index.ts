import type { SiteCrawler } from '../index.js';
import type { TaskConfig } from '../../lib/types.js';
import type { DealerListing, DealerPlatformExtractor, DealerVehiclePayload } from './types.js';
import { sendToServer } from '../../lib/api.js';
import { detectPlatform, type DealerPlatform } from './detect.js';
import { dealerOnExtractor } from './platforms/dealeron.js';
import { dealerFireExtractor } from './platforms/dealerfire.js';
import { dealerInspireExtractor } from './platforms/dealerinspire.js';
import { teamVelocityExtractor } from './platforms/team-velocity.js';

const LOAD_WAIT_MS = 2000;
const MAX_LOAD_ATTEMPTS = 10;
const ITEM_DELAY_MIN_MS = 500;
const ITEM_DELAY_MAX_MS = 1500;
const MAX_RETRIES = 10;
const RETRY_BASE_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const MAX_CONSECUTIVE_SERVER_ERRORS = 5;

const platformExtractors: Record<DealerPlatform, DealerPlatformExtractor> = {
  dealeron: dealerOnExtractor,
  dealerfire: dealerFireExtractor,
  dealerinspire: dealerInspireExtractor,
  'team-velocity': teamVelocityExtractor,
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

function makeFilter(config: TaskConfig): (listing: DealerListing) => boolean {
  const exclude = ((config.excludePatterns as string[] | undefined) ?? []).map((p) =>
    p.toLowerCase(),
  );
  const require = ((config.requirePatterns as string[] | undefined) ?? []).map((p) =>
    p.toLowerCase(),
  );

  return (listing) => {
    const searchText = `${listing.title} ${listing.trim ?? ''}`.toLowerCase();
    for (const p of exclude) {
      if (searchText.includes(p)) return false;
    }
    for (const p of require) {
      if (!searchText.includes(p)) return false;
    }
    return true;
  };
}

export const dealerCrawler: SiteCrawler = {
  name: 'dealer',
  domain: null,
  match: (_url: string, doc?: Document) => {
    if (!doc) return false;
    return detectPlatform(doc) !== null;
  },
  run: async (task, config, progress) => {
    const platform = detectPlatform(document);
    if (!platform) {
      progress.error('Could not detect dealer platform on this page');
      return;
    }

    const extractor = platformExtractors[platform];
    progress.info(`Detected platform: ${platform}`);

    for (let attempt = 0; attempt < MAX_LOAD_ATTEMPTS; attempt++) {
      if (document.querySelectorAll(extractor.cardSelector).length > 0) break;
      progress.info('Waiting for listings to load...');
      await sleep(LOAD_WAIT_MS);
    }

    if (document.querySelectorAll(extractor.cardSelector).length === 0) {
      progress.warn('No listings found on page');
      return;
    }

    if (config.strategy === 'full' && extractor.loadMore) {
      let loaded = 0;
      const maxClicks = 50;
      while (loaded < maxClicks) {
        progress.info(
          `Loading more... (${document.querySelectorAll(extractor.cardSelector).length} loaded)`,
        );
        if (!(await extractor.loadMore())) break;
        loaded++;
        await sleep(LOAD_WAIT_MS);
      }
    }

    const { items, errors } = extractor.extractAllListings(document);
    for (const err of errors) {
      progress.warn(`Extraction error at index ${err.index}: ${err.message}`);
    }

    const filtered = items.filter(makeFilter(config));
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
      progress.info(`Processing ${listing.id}: ${listing.title}`);

      const images: { url: string; name: string; data: string }[] = [];
      if (listing.imageUrl) {
        try {
          const result = await fetchAsBase64(listing.imageUrl);
          images.push({
            url: result.url,
            name: `${listing.vin || listing.stockNumber || listing.id}-0`,
            data: result.base64,
          });
        } catch (err) {
          progress.warn(`Failed to download image for ${listing.id}: ${err}`);
        }
      }

      const payload: DealerVehiclePayload = {
        ...listing,
        images,
        timestamp,
        platform,
      };

      try {
        await sendToServer(task.id, 'dealer', listing.id, payload);
        consecutiveServerErrors = 0;
        progress.itemSaved();
      } catch (err) {
        consecutiveServerErrors++;
        progress.itemError(`Failed to save listing ${listing.id}: ${err}`);
        if (consecutiveServerErrors >= MAX_CONSECUTIVE_SERVER_ERRORS) {
          progress.error(`Aborting — ${MAX_CONSECUTIVE_SERVER_ERRORS} consecutive server errors`);
          break;
        }
      }

      await randomDelay(ITEM_DELAY_MIN_MS, ITEM_DELAY_MAX_MS);
    }

    progress.info(`Crawl complete. Saved ${progress.savedCount} of ${filtered.length} listings.`);
  },
};
