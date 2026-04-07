import type { SiteCrawler } from '../index.js';
import type { Task, TaskConfig } from '../../lib/types.js';
import type { CrawlProgress } from '../../lib/progress.js';
import type { LexusVehicleData, LexusVehiclePayload, LexusCPOPayload } from './types.js';
import { sendToServer } from '../../lib/api.js';
import {
  matchesLexus,
  parseVehicleData,
  extractAllCPOListings,
  RESULTS_CONTAINER_SELECTOR,
  CPO_TILE_SELECTOR,
} from './extractors.js';

const LOAD_WAIT_MS = 2000;
const MAX_LOAD_MORE_CLICKS = 50;
const ITEM_DELAY_MIN_MS = 500;
const ITEM_DELAY_MAX_MS = 1500;
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

/**
 * Walk the React fiber tree to find the vehicle data array.
 * Lexus uses React + Jotai; vehicle data lives in the VehicleGrid
 * component's parent props.
 */
function extractVehicleDataFromFiber(): LexusVehicleData[] {
  const gridEl = document.querySelector(RESULTS_CONTAINER_SELECTOR);
  if (!gridEl) return [];

  // Walk React fiber internals
  const fiberKey = Object.keys(gridEl).find((k) => k.startsWith('__reactFiber$'));
  if (!fiberKey) return [];

  let fiber = (gridEl as any)[fiberKey];
  const vehicles: LexusVehicleData[] = [];
  const visited = new Set<any>();

  // Walk up the fiber tree to find props containing vehicle arrays
  while (fiber) {
    if (visited.has(fiber)) break;
    visited.add(fiber);

    const props = fiber.memoizedProps ?? fiber.pendingProps;
    if (props) {
      // Look for a vehicles/inventory array in props
      for (const key of Object.keys(props)) {
        const val = props[key];
        if (Array.isArray(val) && val.length > 0 && val[0]?.vin) {
          for (const item of val) {
            const parsed = parseVehicleData(item);
            if (parsed) vehicles.push(parsed);
          }
          if (vehicles.length > 0) return vehicles;
        }
      }
    }
    fiber = fiber.return;
  }

  return vehicles;
}

/**
 * Include trim in filter text so patterns can match on trim-level details.
 */
function passesFilters(vehicle: LexusVehicleData, config: TaskConfig): boolean {
  const excludePatterns = (config.excludePatterns as string[] | undefined) ?? [];
  const requirePatterns = (config.requirePatterns as string[] | undefined) ?? [];

  const nameLower = vehicle.name.toLowerCase();
  const trimLower = (vehicle.trim?.value ?? '').toLowerCase();
  const searchText = `${nameLower} ${trimLower}`;

  for (const pattern of excludePatterns) {
    if (searchText.includes(pattern.toLowerCase())) return false;
  }

  for (const pattern of requirePatterns) {
    if (!searchText.includes(pattern.toLowerCase())) return false;
  }

  return true;
}

/**
 * Click "LOAD MORE" button and wait for new vehicles to appear.
 * Returns true if new vehicles loaded.
 */
async function loadMoreResults(): Promise<boolean> {
  const beforeCount = document.querySelector(RESULTS_CONTAINER_SELECTOR)?.children.length ?? 0;

  const loadMoreBtn = [...document.querySelectorAll('button')].find(
    (b) => b.textContent?.trim().toUpperCase() === 'LOAD MORE',
  ) as HTMLButtonElement | undefined;

  if (!loadMoreBtn) return false;

  loadMoreBtn.click();
  await sleep(LOAD_WAIT_MS);

  for (let i = 0; i < 5; i++) {
    const currentCount = document.querySelector(RESULTS_CONTAINER_SELECTOR)?.children.length ?? 0;
    if (currentCount > beforeCount) return true;
    await sleep(1000);
  }

  return false;
}

/** CPO listings use model + trim for filter text (e.g. "NX 300 F SPORT"). */
function passesCPOFilters(
  listing: { model: string | null; trim: string | null; dealer: string | null },
  config: TaskConfig,
): boolean {
  const excludePatterns = (config.excludePatterns as string[] | undefined) ?? [];
  const requirePatterns = (config.requirePatterns as string[] | undefined) ?? [];

  const modelLower = (listing.model ?? '').toLowerCase();
  const trimLower = (listing.trim ?? '').toLowerCase();
  const dealerLower = (listing.dealer ?? '').toLowerCase();
  const searchText = `${modelLower} ${trimLower} ${dealerLower}`;

  for (const pattern of excludePatterns) {
    if (searchText.includes(pattern.toLowerCase())) return false;
  }

  for (const pattern of requirePatterns) {
    if (!searchText.includes(pattern.toLowerCase())) return false;
  }

  return true;
}

/** Crawl Lexus L/Certified Pre-Owned inventory from the server-rendered DOM. */
async function runCPOCrawl(task: Task, config: TaskConfig, progress: CrawlProgress): Promise<void> {
  progress.info('Starting Lexus L/Certified crawl');

  // Wait for CPO tiles to appear
  for (let attempt = 0; attempt < 10; attempt++) {
    if (document.querySelector(CPO_TILE_SELECTOR)) break;
    progress.info('Waiting for L/Certified listings to load...');
    await sleep(LOAD_WAIT_MS);
  }

  if (!document.querySelector(CPO_TILE_SELECTOR)) {
    progress.warn('No L/Certified listings found on page');
    return;
  }

  // Extract all CPO listings from the DOM
  const { items, errors } = extractAllCPOListings(document);
  for (const err of errors) {
    progress.warn(`Extraction error at index ${err.index}: ${err.message}`);
  }

  // Apply client-side filters
  const filtered = items.filter((v) => passesCPOFilters(v, config));
  const skipped = items.length - filtered.length;
  if (skipped > 0) {
    progress.info(`Filtered out ${skipped} listings (${filtered.length} remaining)`);
  }

  progress.setFound(filtered.length);
  if (filtered.length === 0) {
    progress.warn('No matching L/Certified listings found');
    return;
  }

  const timestamp = new Date().toISOString();
  let consecutiveServerErrors = 0;

  for (const listing of filtered) {
    const label = `${listing.year ?? ''} ${listing.model ?? ''} ${listing.trim ?? ''}`.trim();
    progress.info(`Processing ${listing.vin}: ${label}`);

    // Download the listing image if available
    const images: { url: string; name: string; data: string }[] = [];
    if (listing.imageUrl) {
      try {
        const fetched = await fetchAsBase64(listing.imageUrl);
        images.push({ url: fetched.url, name: `${listing.vin}-cpo-0`, data: fetched.base64 });
      } catch {
        // Image download failed; continue without it
      }
    }

    const payload: LexusCPOPayload = {
      ...listing,
      images,
      timestamp,
    };

    try {
      await sendToServer(task.id, 'lexus', listing.vin, payload);
      consecutiveServerErrors = 0;
      progress.itemSaved();
    } catch (err) {
      consecutiveServerErrors++;
      progress.itemError(`Failed to save L/Certified listing ${listing.vin}: ${err}`);
      if (consecutiveServerErrors >= MAX_CONSECUTIVE_SERVER_ERRORS) {
        progress.error(`Aborting — ${MAX_CONSECUTIVE_SERVER_ERRORS} consecutive server errors`);
        break;
      }
    }

    await randomDelay(ITEM_DELAY_MIN_MS, ITEM_DELAY_MAX_MS);
  }

  progress.info(
    `L/Certified crawl complete. Saved ${progress.savedCount} of ${filtered.length} listings.`,
  );
}

/** Crawl Lexus new inventory from lexus.com (DOM + React fiber). */
async function runNewInventoryCrawl(
  task: Task,
  config: TaskConfig,
  progress: CrawlProgress,
): Promise<void> {
  progress.info('Starting Lexus new inventory crawl');

  // Wait for TileGrid to appear
  for (let attempt = 0; attempt < 10; attempt++) {
    if (document.querySelector(RESULTS_CONTAINER_SELECTOR)) break;
    progress.info('Waiting for inventory grid to load...');
    await sleep(LOAD_WAIT_MS);
  }

  if (!document.querySelector(RESULTS_CONTAINER_SELECTOR)) {
    progress.warn('No inventory grid found on page');
    return;
  }

  // Load all results if strategy is 'full'
  if (config.strategy === 'full') {
    let clicks = 0;
    while (clicks < MAX_LOAD_MORE_CLICKS) {
      const cardCount = document.querySelector(RESULTS_CONTAINER_SELECTOR)?.children.length ?? 0;
      progress.info(`Loading more... (${cardCount} cards loaded)`);
      if (!(await loadMoreResults())) break;
      clicks++;
    }
  }

  // Extract vehicle data from React fiber
  const allVehicles = extractVehicleDataFromFiber();
  if (allVehicles.length === 0) {
    progress.warn('No vehicle data found in React fiber');
    return;
  }

  // Apply client-side filters
  const filtered = allVehicles.filter((v) => passesFilters(v, config));
  const skipped = allVehicles.length - filtered.length;
  if (skipped > 0) {
    progress.info(`Filtered out ${skipped} vehicles (${filtered.length} remaining)`);
  }

  progress.setFound(filtered.length);
  if (filtered.length === 0) {
    progress.warn('No matching vehicles found');
    return;
  }

  const timestamp = new Date().toISOString();
  let consecutiveServerErrors = 0;

  for (const vehicle of filtered) {
    progress.info(`Processing ${vehicle.vin}: ${vehicle.name} ${vehicle.trim?.value ?? ''}`);

    const images: { url: string; name: string; data: string }[] = [];
    const jellyUrl = vehicle.jelly?.image?.desktop?.src;
    if (jellyUrl) {
      try {
        const fetched = await fetchAsBase64(jellyUrl);
        images.push({ url: fetched.url, name: `${vehicle.vin}-jelly`, data: fetched.base64 });
      } catch {
        // Image download failed; continue without it
      }
    }

    const payload: LexusVehiclePayload = {
      vin: vehicle.vin,
      name: vehicle.name,
      marketingSeries: vehicle.marketingSeries,
      year: vehicle.year,
      model: vehicle.model,
      trim: vehicle.trim?.value ?? null,
      trimCode: vehicle.trim?.code ?? null,
      stockNum: vehicle.stockNum,
      mileage: vehicle.mileage,
      description: vehicle.description,
      isElectric: vehicle.isElectric,
      isPreSold: vehicle.isPreSold,
      isMonogram: vehicle.isSmartPath,
      engine: vehicle.engine?.value ?? null,
      fuelType: vehicle.fuelType?.value ?? null,
      drivetrain: vehicle.drivetrain?.value ?? null,
      baseMsrp: vehicle.baseMsrp,
      msrp: vehicle.msrp,
      price: vehicle.price,
      priceData: vehicle.priceData,
      dealerName: vehicle.dealer?.name ?? null,
      dealerCode: vehicle.dealer?.code ?? null,
      dealerDistance: vehicle.dealer?.distance ?? null,
      dealerSiteURL: vehicle.dealer?.dealerSiteURL ?? null,
      extColor: vehicle.extColor?.value ?? null,
      extColorCode: vehicle.extColor?.code ?? null,
      intColor: vehicle.intColor?.value ?? null,
      intColorCode: vehicle.intColor?.code ?? null,
      estMpg: vehicle.estMpg,
      modelCode: vehicle.modelData?.modelCd ?? null,
      marketingName: vehicle.modelData?.marketingName ?? null,
      marketingTitle: vehicle.modelData?.marketingTitle ?? null,
      category: vehicle.category,
      inventoryStatus: vehicle.inventoryStatus,
      vdpUrl: vehicle.vdpUrl,
      options: vehicle.options,
      images,
      timestamp,
    };

    try {
      await sendToServer(task.id, 'lexus', vehicle.vin, payload);
      consecutiveServerErrors = 0;
      progress.itemSaved();
    } catch (err) {
      consecutiveServerErrors++;
      progress.itemError(`Failed to save vehicle ${vehicle.vin}: ${err}`);
      if (consecutiveServerErrors >= MAX_CONSECUTIVE_SERVER_ERRORS) {
        progress.error(`Aborting — ${MAX_CONSECUTIVE_SERVER_ERRORS} consecutive server errors`);
        break;
      }
    }

    // Jittered delay between vehicles
    await randomDelay(ITEM_DELAY_MIN_MS, ITEM_DELAY_MAX_MS);
  }

  progress.info(`Crawl complete. Saved ${progress.savedCount} of ${filtered.length} vehicles.`);
}

export const lexusCrawler: SiteCrawler = {
  name: 'lexus',
  domain: 'lexus.com',
  match: matchesLexus,
  run: async (task, config, progress) => {
    const isCPO = window.location.pathname.includes('/lcertified/');
    if (isCPO) {
      await runCPOCrawl(task, config, progress);
    } else {
      await runNewInventoryCrawl(task, config, progress);
    }
  },
};
