import type { SiteCrawler } from '../index.js';
import type { Task, TaskConfig } from '../../lib/types.js';
import type { CrawlProgress } from '../../lib/progress.js';
import type {
  ToyotaVehicleData,
  ToyotaVehiclePayload,
  ToyotaCPOVehicle,
  ToyotaCPOPayload,
} from './types.js';
import { sendToServer } from '../../lib/api.js';
import {
  extractAllListings,
  matchesToyota,
  parseVehicleData,
  parseCPOVehicle,
  RESULTS_CONTAINER_SELECTOR,
} from './extractors.js';

const LOAD_WAIT_MS = 2000;
const MAX_LOAD_MORE_CLICKS = 50;
const MAX_LOAD_ATTEMPTS = 10;

// Pacing: randomized delays to avoid uniform bot patterns.
const ITEM_DELAY_MIN_MS = 500;
const ITEM_DELAY_MAX_MS = 1500;
const IMAGE_BATCH_SIZE = 6; // Chrome's per-host connection limit
const MAX_RETRIES = 10;
const RETRY_BASE_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const MAX_CONSECUTIVE_SERVER_ERRORS = 5;

// CPO REST API constants
const CPO_API_PAGE_SIZE = 25;
const CPO_MAX_PAGES = 100;

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

function fetchJson(url: string, retries = MAX_RETRIES): Promise<any> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      onload: async (response) => {
        if (response.status === 429 || response.status >= 500) {
          if (retries > 0) {
            const delay = Math.min(
              RETRY_BASE_MS * Math.pow(2, MAX_RETRIES - retries),
              MAX_BACKOFF_MS,
            );
            await sleep(delay);
            fetchJson(url, retries - 1).then(resolve, reject);
            return;
          }
          reject(new Error(`HTTP ${response.status} after retries`));
          return;
        }
        try {
          resolve(JSON.parse(response.responseText));
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
          fetchJson(url, retries - 1).then(resolve, reject);
          return;
        }
        reject(new Error(`Network error: ${JSON.stringify(err)}`));
      },
    });
  });
}

/**
 * Extract vehicle data array from VehicleGrid's React fiber.
 * Returns parsed ToyotaVehicleData objects.
 */
function extractVehicleDataFromFiber(): ToyotaVehicleData[] {
  const grid = document.querySelector('[data-testid="VehicleGrid"]') as any;
  if (!grid) return [];

  const fiberKey = Object.keys(grid).find((k) => k.startsWith('__reactFiber'));
  if (!fiberKey) return [];

  const vehicleData = (grid as any)[fiberKey]?.return?.memoizedProps?.vehicleData;
  if (!Array.isArray(vehicleData)) return [];

  const results: ToyotaVehicleData[] = [];
  for (const v of vehicleData) {
    const parsed = parseVehicleData(v);
    if (parsed) results.push(parsed);
  }
  return results;
}

// Toyota card titles are "Camry LE" (no year), so we include trim
// in the search text to allow filtering on trim-level patterns.
function passesFilters(vehicle: ToyotaVehicleData, config: TaskConfig): boolean {
  const excludePatterns = (config.excludePatterns as string[] | undefined) ?? [];
  const requirePatterns = (config.requirePatterns as string[] | undefined) ?? [];

  const nameLower = (vehicle.name ?? '').toLowerCase();
  const trimLower = (vehicle.trim ?? '').toLowerCase();
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
 * Click "LOAD MORE" and wait for new cards to appear.
 * Returns true if new results loaded.
 */
async function loadMoreResults(): Promise<boolean> {
  const beforeCount = document.querySelectorAll(`${RESULTS_CONTAINER_SELECTOR} > div`).length;

  const loadMoreBtn = [...document.querySelectorAll('button')].find(
    (b) => b.textContent?.trim().toUpperCase() === 'LOAD MORE',
  ) as HTMLButtonElement | undefined;

  if (!loadMoreBtn) return false;

  loadMoreBtn.click();
  await sleep(LOAD_WAIT_MS);

  for (let i = 0; i < 5; i++) {
    if (document.querySelectorAll(`${RESULTS_CONTAINER_SELECTOR} > div`).length > beforeCount)
      return true;
    await sleep(1000);
  }

  return false;
}

/** CPO vehicles use marketingSeries + grade for filter text (e.g. "RAV4 HYBRID LE"). */
function passesCPOFilters(vehicle: ToyotaCPOVehicle, config: TaskConfig): boolean {
  const excludePatterns = (config.excludePatterns as string[] | undefined) ?? [];
  const requirePatterns = (config.requirePatterns as string[] | undefined) ?? [];

  const seriesLower = (vehicle.marketingSeries ?? '').toLowerCase();
  const gradeLower = (vehicle.grade ?? '').toLowerCase();
  const modelLower = (vehicle.model ?? '').toLowerCase();
  const searchText = `${seriesLower} ${gradeLower} ${modelLower}`;

  for (const pattern of excludePatterns) {
    if (searchText.includes(pattern.toLowerCase())) return false;
  }

  for (const pattern of requirePatterns) {
    if (!searchText.includes(pattern.toLowerCase())) return false;
  }

  return true;
}

/** Build the CPO REST API URL for a given page. */
function buildCPOApiUrl(config: TaskConfig, pageNo: number): string {
  const zip = (config.zip as string) || '97201';
  const radius = (config.distance as number) || 25;
  return `https://www.toyotacertified.com/rest/uvii/vehicles?zipcode=${zip}&pageNo=${pageNo}&pageSize=${CPO_API_PAGE_SIZE}&brand=TOYOTA&radius=${radius}miles&certification=TCUV`;
}

/** Crawl Toyota Certified Pre-Owned inventory via REST API. */
async function runCPOCrawl(task: Task, config: TaskConfig, progress: CrawlProgress): Promise<void> {
  progress.info('Starting Toyota CPO crawl');

  // Fetch first page to get total pages
  const firstUrl = buildCPOApiUrl(config, 1);
  progress.info(`Fetching page 1: ${firstUrl}`);

  let firstPage: any;
  try {
    firstPage = await fetchJson(firstUrl);
  } catch (err) {
    progress.error(`Failed to fetch CPO API: ${err}`);
    return;
  }

  const vehicleSummary = firstPage?.vehicleSummary;
  if (!Array.isArray(vehicleSummary)) {
    progress.warn('No vehicles found in CPO API response');
    return;
  }

  const totalPages = Math.min(firstPage?.pagination?.totalPages ?? 1, CPO_MAX_PAGES);
  const totalRecords = firstPage?.pagination?.totalRecords ?? vehicleSummary.length;
  progress.info(`CPO API: ${totalRecords} total records across ${totalPages} pages`);

  // Collect all vehicles from all pages
  const allRawVehicles: unknown[] = [...vehicleSummary];

  if (config.strategy === 'full' && totalPages > 1) {
    for (let page = 2; page <= totalPages; page++) {
      progress.info(`Fetching page ${page} of ${totalPages}...`);
      try {
        const pageData = await fetchJson(buildCPOApiUrl(config, page));
        const vehicles = pageData?.vehicleSummary;
        if (Array.isArray(vehicles)) {
          allRawVehicles.push(...vehicles);
        } else {
          progress.warn(`Page ${page} returned no vehicles`);
          break;
        }
      } catch (err) {
        progress.warn(`Failed to fetch page ${page}: ${err}`);
        break;
      }
      await randomDelay(ITEM_DELAY_MIN_MS, ITEM_DELAY_MAX_MS);
    }
  }

  // Parse all vehicles
  const parsed: ToyotaCPOVehicle[] = [];
  for (const raw of allRawVehicles) {
    const vehicle = parseCPOVehicle(raw);
    if (vehicle) parsed.push(vehicle);
  }
  progress.info(`Parsed ${parsed.length} of ${allRawVehicles.length} vehicles`);

  // Apply filters
  const filtered = parsed.filter((v) => passesCPOFilters(v, config));
  const skipped = parsed.length - filtered.length;
  if (skipped > 0) {
    progress.info(`Filtered out ${skipped} listings (${filtered.length} remaining)`);
  }

  progress.setFound(filtered.length);
  if (filtered.length === 0) {
    progress.warn('No matching CPO listings found');
    return;
  }

  const timestamp = new Date().toISOString();
  let consecutiveServerErrors = 0;

  for (const vehicle of filtered) {
    const label = `${vehicle.year} ${vehicle.marketingSeries ?? ''} ${vehicle.grade ?? ''}`.trim();
    progress.info(`Processing ${vehicle.vin}: ${label}`);

    // Download images in batches
    const images: { url: string; name: string; data: string }[] = [];
    for (let i = 0; i < vehicle.imageUrls.length; i += IMAGE_BATCH_SIZE) {
      const batch = vehicle.imageUrls.slice(i, i + IMAGE_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((url, idx) =>
          fetchAsBase64(url).then((fetched) => ({
            url: fetched.url,
            name: `${vehicle.vin}-cpo-${i + idx}`,
            data: fetched.base64,
          })),
        ),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') images.push(r.value);
      }
    }

    const payload: ToyotaCPOPayload = {
      ...vehicle,
      images,
      timestamp,
    };

    try {
      await sendToServer(task.id, 'toyota', vehicle.vin, payload);
      consecutiveServerErrors = 0;
      progress.itemSaved();
    } catch (err) {
      consecutiveServerErrors++;
      progress.itemError(`Failed to save CPO listing ${vehicle.vin}: ${err}`);
      if (consecutiveServerErrors >= MAX_CONSECUTIVE_SERVER_ERRORS) {
        progress.error(`Aborting — ${MAX_CONSECUTIVE_SERVER_ERRORS} consecutive server errors`);
        break;
      }
    }

    await randomDelay(ITEM_DELAY_MIN_MS, ITEM_DELAY_MAX_MS);
  }

  progress.info(`CPO crawl complete. Saved ${progress.savedCount} of ${filtered.length} listings.`);
}

/** Crawl Toyota new inventory from toyota.com (DOM + React fiber). */
async function runNewInventoryCrawl(
  task: Task,
  config: TaskConfig,
  progress: CrawlProgress,
): Promise<void> {
  progress.info('Starting Toyota new inventory crawl');

  // Wait for TileGrid to load
  for (let attempt = 0; attempt < MAX_LOAD_ATTEMPTS; attempt++) {
    if (document.querySelector(RESULTS_CONTAINER_SELECTOR)) break;
    progress.info('Waiting for listings to load...');
    await sleep(LOAD_WAIT_MS);
  }

  if (!document.querySelector(RESULTS_CONTAINER_SELECTOR)) {
    progress.warn('No listings found on page');
    return;
  }

  // Load all results if strategy is 'full'
  if (config.strategy === 'full') {
    let clicks = 0;
    while (clicks < MAX_LOAD_MORE_CLICKS) {
      progress.info(
        `Loading more... (${document.querySelectorAll(`${RESULTS_CONTAINER_SELECTOR} > div`).length} loaded)`,
      );
      if (!(await loadMoreResults())) break;
      clicks++;
    }
  }

  // Extract vehicle data from React fiber (preferred — has all structured data)
  const fiberVehicles = extractVehicleDataFromFiber();
  progress.info(`Extracted ${fiberVehicles.length} vehicles from React fiber`);

  // If fiber extraction fails, fall back to DOM extraction
  if (fiberVehicles.length === 0) {
    progress.warn('React fiber extraction failed, falling back to DOM extraction');
    const { items, errors } = extractAllListings(document);
    for (const err of errors) {
      progress.warn(`Extraction error at index ${err.index}: ${err.message}`);
    }

    progress.setFound(items.length);
    if (items.length === 0) {
      progress.warn('No matching listings found');
      return;
    }

    const timestamp = new Date().toISOString();
    let consecutiveServerErrors = 0;

    for (const listing of items) {
      progress.info(`Processing ${listing.vin}: ${listing.title}`);

      const payload: ToyotaVehiclePayload = {
        ...listing,
        name: null,
        marketingSeries: null,
        trimCode: null,
        stockNum: null,
        mileage: null,
        description: null,
        isElectric: false,
        isPreSold: false,
        engine: null,
        engineCode: null,
        fuelType: null,
        fuelTypeCode: null,
        drivetrain: null,
        drivetrainCode: null,
        baseMsrp: null,
        msrp: null,
        priceData: null,
        dealerData: null,
        extColor: null,
        intColor: null,
        estMpg: null,
        category: [],
        inventoryStatus: null,
        vdpUrl: null,
        options: [],
        images: [],
        timestamp,
      };

      try {
        await sendToServer(task.id, 'toyota', listing.vin, payload);
        consecutiveServerErrors = 0;
        progress.itemSaved();
      } catch (err) {
        consecutiveServerErrors++;
        progress.itemError(`Failed to save listing ${listing.vin}: ${err}`);
        if (consecutiveServerErrors >= MAX_CONSECUTIVE_SERVER_ERRORS) {
          progress.error(`Aborting — ${MAX_CONSECUTIVE_SERVER_ERRORS} consecutive server errors`);
          break;
        }
      }

      await randomDelay(ITEM_DELAY_MIN_MS, ITEM_DELAY_MAX_MS);
    }

    progress.info(`Crawl complete. Saved ${progress.savedCount} of ${items.length} listings.`);
    return;
  }

  // Apply client-side filters
  const filtered = fiberVehicles.filter((v) => passesFilters(v, config));
  const skipped = fiberVehicles.length - filtered.length;
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

  for (const vehicle of filtered) {
    progress.info(`Processing ${vehicle.vin}: ${vehicle.name ?? vehicle.trim ?? ''}`);

    const images: { url: string; name: string; data: string }[] = [];
    if (vehicle.imageUrl) {
      try {
        const fetched = await fetchAsBase64(vehicle.imageUrl);
        images.push({ url: fetched.url, name: `${vehicle.vin}-jelly-0`, data: fetched.base64 });
      } catch {
        // Image download failed; continue without it
      }
    }

    const payload: ToyotaVehiclePayload = {
      vin: vehicle.vin,
      title: vehicle.trim ?? vehicle.name ?? '',
      year: vehicle.year,
      make: 'Toyota',
      model: vehicle.model,
      trim: vehicle.trim,
      price: vehicle.price != null ? `$${vehicle.price.toLocaleString()}` : null,
      priceNumeric: vehicle.price,
      dealerText: vehicle.dealer
        ? `${vehicle.dealer.name}${vehicle.dealer.distance != null ? ` (${vehicle.dealer.distance} mi)` : ''}`
        : null,
      tags: [vehicle.fuelType, vehicle.drivetrain].filter(Boolean).join('') || null,
      matchStatus: null,
      isSmartPath: vehicle.isSmartPath,
      buildPhase: vehicle.inventoryStatus,
      link: vehicle.href,
      imageUrl: vehicle.imageUrl,
      name: vehicle.name,
      marketingSeries: vehicle.marketingSeries,
      trimCode: vehicle.trimCode,
      stockNum: vehicle.stockNum,
      mileage: vehicle.mileage,
      description: vehicle.description,
      isElectric: vehicle.isElectric,
      isPreSold: vehicle.isPreSold,
      engine: vehicle.engine,
      engineCode: vehicle.engineCode,
      fuelType: vehicle.fuelType,
      fuelTypeCode: vehicle.fuelTypeCode,
      drivetrain: vehicle.drivetrain,
      drivetrainCode: vehicle.drivetrainCode,
      baseMsrp: vehicle.baseMsrp,
      msrp: vehicle.msrp,
      priceData: vehicle.priceData,
      dealerData: vehicle.dealer,
      extColor: vehicle.extColor,
      intColor: vehicle.intColor,
      estMpg: vehicle.estMpg,
      category: vehicle.category,
      inventoryStatus: vehicle.inventoryStatus,
      vdpUrl: vehicle.vdpUrl,
      options: vehicle.options,
      images,
      timestamp,
    };

    try {
      await sendToServer(task.id, 'toyota', vehicle.vin, payload);
      consecutiveServerErrors = 0;
      progress.itemSaved();
    } catch (err) {
      consecutiveServerErrors++;
      progress.itemError(`Failed to save listing ${vehicle.vin}: ${err}`);
      if (consecutiveServerErrors >= MAX_CONSECUTIVE_SERVER_ERRORS) {
        progress.error(`Aborting — ${MAX_CONSECUTIVE_SERVER_ERRORS} consecutive server errors`);
        break;
      }
    }

    // Jittered delay between vehicles
    await randomDelay(ITEM_DELAY_MIN_MS, ITEM_DELAY_MAX_MS);
  }

  progress.info(`Crawl complete. Saved ${progress.savedCount} of ${filtered.length} listings.`);
}

export const toyotaCrawler: SiteCrawler = {
  name: 'toyota',
  domain: 'toyota.com',
  match: matchesToyota,
  run: async (task, config, progress) => {
    const isCPO = window.location.hostname.includes('toyotacertified.com');
    if (isCPO) {
      await runCPOCrawl(task, config, progress);
    } else {
      await runNewInventoryCrawl(task, config, progress);
    }
  },
};
