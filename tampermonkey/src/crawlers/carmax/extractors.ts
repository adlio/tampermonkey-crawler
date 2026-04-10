import type {
  CarMaxRawListing,
  ExtractionResult,
  ExtractionError,
  VehicleSpec,
  VehicleImage,
} from './types.js';

/**
 * The root card element is a semantic <article> with data-id (stock number)
 * and data-clickprops (structured metadata). The data-* attribute selector
 * works for both the current <article> tags and legacy <div> markup.
 */
export const CARD_SELECTOR = '[data-id][data-clickprops]';

/**
 * Parse the data-clickprops attribute into a key-value map.
 * Format: "Key1: value1,Key2: value2,..."
 */
export function parseClickProps(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const colonIdx = pair.indexOf(':');
    if (colonIdx === -1) continue;
    const key = pair.slice(0, colonIdx).trim();
    const value = pair.slice(colonIdx + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

/**
 * Parse a CarMax listing title like "2025 Rivian R1S Adventure Dual-Motor Max"
 * into { year, make, model, trim }.
 */
export function parseTitle(title: string): {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
} {
  const match = title.match(/^(\d{4})\s+(\S+)\s+(\S+)\s*(.*)?$/);
  if (!match) return { year: null, make: null, model: null, trim: null };
  return {
    year: parseInt(match[1], 10),
    make: match[2],
    model: match[3],
    trim: match[4]?.trim() || null,
  };
}

/**
 * Extract location/availability text from a card.
 * Prefers the new .kmx-car-tile__availability div, falls back to legacy
 * .kmx-car-tile__location-info spans.
 */
function extractLocation(card: Element): string | null {
  const availabilityEl = card.querySelector('.kmx-car-tile__availability');
  if (availabilityEl) return availabilityEl.textContent?.trim() ?? null;

  const locationSpans = card.querySelectorAll('.kmx-car-tile__location-info span');
  const parts = Array.from(locationSpans).map((s) => s.textContent?.trim() ?? '');
  return parts.join('') || null;
}

/**
 * Extract structured data from a single CarMax listing card.
 * Pure function — no side effects, no network calls.
 *
 * Selector priority: ARIA attributes > semantic HTML > data-* > class names.
 */
export function extractListing(card: Element): CarMaxRawListing | null {
  const stockNumber = card.getAttribute('data-id');
  if (!stockNumber) return null;

  // Title: <a class="kmx-car-tile__make-model-link"> wraps <h3>
  // Prefer h3 (semantic), fall back to the link itself
  const titleLink = card.querySelector('.kmx-car-tile__make-model-link');
  const titleEl = card.querySelector('h3') ?? titleLink;
  const title = titleEl?.textContent?.trim() ?? '';
  if (!title) return null;

  const clickpropsRaw = card.getAttribute('data-clickprops') ?? '';
  const props = parseClickProps(clickpropsRaw);

  const { year, make, model } = parseTitle(title);

  // Trim: prefer aria-label="Trim: ..." (accessibility contract), fall back to
  // data-clickprops parsing, then parseTitle
  const trimEl = card.querySelector('[aria-label^="Trim:"]');
  const trim = trimEl
    ? trimEl.getAttribute('aria-label')!.replace(/^Trim:\s*/, '')
    : (parseTitle(title).trim ?? null);

  // Price: prefer .kmx-car-tile__price (stable BEM class), fall back to data-clickprops
  const priceEl = card.querySelector('.kmx-car-tile__price');
  const price = priceEl?.textContent?.trim() ?? null;
  const priceNumeric = props['Price'] ? parseInt(props['Price'], 10) : null;

  // Mileage: prefer aria-label ending in "miles" (accessibility contract),
  // fall back to .kmx-car-tile__mileage class
  const mileageEl =
    card.querySelector('[aria-label$="miles"]') ?? card.querySelector('.kmx-car-tile__mileage');
  const mileage = mileageEl?.textContent?.trim() ?? null;

  // Link: from the make-model link or any link to /car/{stockNumber}
  const link =
    titleLink?.getAttribute('href') ??
    card.querySelector(`a[href="/car/${stockNumber}"]`)?.getAttribute('href') ??
    null;

  // Image: first img with alt text inside the card (hero image in swiper slide)
  const imgEl = card.querySelector(
    '[role="group"] img[alt], .kmx-car-tile__image-gallery img',
  ) as HTMLImageElement | null;
  const imageUrl = imgEl?.getAttribute('src') ?? null;

  // Location/availability: now in .kmx-car-tile__availability div,
  // fall back to legacy .kmx-car-tile__location-info spans
  const location = extractLocation(card);

  // Parse shipping cost from location text like "$549 Shipping | Est. arrival ..."
  const shippingMatch = location?.match(/\$[\d,]+\s*Shipping/);
  const shippingCost = shippingMatch ? shippingMatch[0] : null;

  // Monthly estimate: prefer aria-label on monthly-payment button,
  // fall back to button text content
  const monthlyBtn = card.querySelector(
    '[aria-label*="per month"], .kmx-car-tile__monthly-payment',
  );
  const monthlyEstimate = monthlyBtn?.textContent?.trim() ?? null;

  return {
    stockNumber,
    title,
    year,
    make,
    model,
    trim,
    price,
    priceNumeric,
    mileage,
    link,
    imageUrl,
    location,
    shippingCost,
    monthlyEstimate,
    isReserved: props['Reserved'] === 'true',
    isComingSoon: props['Coming Soon'] === 'true',
    isMarkedDown: props['Marked Down'] === 'true',
  };
}

/**
 * The main results container. Cards outside this are recommendations.
 */
export const RESULTS_CONTAINER_SELECTOR = '.listing-container';

/**
 * Extract all CarMax listings from a root element or document.
 * Scopes to the .listing-container to exclude "Lower priced recommendations"
 * that CarMax appends after the real search results.
 */
export function extractAllListings(root: Element | Document): ExtractionResult<CarMaxRawListing> {
  const items: CarMaxRawListing[] = [];
  const errors: ExtractionError[] = [];

  // Scope to the main results container to exclude recommendations
  const container = root.querySelector(RESULTS_CONTAINER_SELECTOR) ?? root;
  const cards = container.querySelectorAll(CARD_SELECTOR);

  Array.from(cards).forEach((card, index) => {
    try {
      const result = extractListing(card);
      if (result) {
        items.push(result);
      } else {
        errors.push({
          index,
          selector: CARD_SELECTOR,
          message: 'Missing stock number or title',
        });
      }
    } catch (err) {
      errors.push({
        index,
        selector: CARD_SELECTOR,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return { items, errors };
}

/**
 * Check whether a URL matches CarMax search results.
 * Matches /cars/ (search results) but not /car/ (single detail page).
 */
export function matchesCarMax(url: string): boolean {
  return /carmax\.com\/cars(\/|$|\?)/.test(url);
}

/**
 * Extract VIN from the detail page HTML.
 * The detail page is server-rendered with VIN in the page content.
 *
 * Tries multiple patterns in order of specificity:
 * 1. aria-label containing VIN (accessibility contract, most durable)
 * 2. Class-based tombstone-vin container (legacy)
 * 3. Generic "VIN" label followed by a 17-character VIN string (fallback)
 */
export function extractVinFromHtml(html: string): string | null {
  // aria-label based: <span aria-label="VIN: ...">
  const ariaMatch = html.match(/aria-label="VIN[:\s]+([A-HJ-NPR-Z0-9]{17})"/i);
  if (ariaMatch) return ariaMatch[1];

  // Legacy class-based: <div class="tombstone-vin">...<span>VIN</span><span>ABC123...</span>
  const tombstoneMatch = html.match(
    /class="tombstone-vin[^"]*"[^>]*>[\s\S]*?<span[^>]*>VIN<\/span>\s*<span[^>]*>([A-HJ-NPR-Z0-9]{17})<\/span>/i,
  );
  if (tombstoneMatch) return tombstoneMatch[1];

  // Generic fallback: any "VIN" label near a 17-char VIN string
  return html.match(/VIN[\s\S]*?([A-HJ-NPR-Z0-9]{17})/)?.[1] ?? null;
}

/**
 * Parse categorized specs from the CarMax specs API.
 * API: GET /car/api/specs/categorized/{stockNumber}/{state}
 *
 * Returns all specs as flat label/value pairs, plus the raw categorized data.
 * Includes battery capacity, range, charge time, MPG, engine, drivetrain, etc.
 */
export function parseSpecsApi(
  categories: Array<{
    displayName: string;
    specifications: Array<{ displayName: string; displayValue: string }>;
  }>,
): VehicleSpec[] {
  const specs: VehicleSpec[] = [];
  for (const category of categories) {
    for (const spec of category.specifications) {
      if (spec.displayValue) {
        specs.push({ label: spec.displayName, value: spec.displayValue });
      }
    }
  }
  return specs;
}

/**
 * Parse the image manifest JSON from the CarMax image API.
 * API: GET https://img2.carmax.com/api/subject/{stockNumber}
 */
export function parseImageManifest(data: {
  items: Array<{
    type: string;
    name: string;
    thumbnailUrl: string;
    fullSizeUrl: string;
    metadata?: { category?: string };
  }>;
}): VehicleImage[] {
  return data.items
    .filter((item) => item.type === 'image')
    .map((item) => ({
      name: item.name,
      type: item.type,
      category: item.metadata?.category ?? null,
      thumbnailUrl: item.thumbnailUrl,
      fullSizeUrl: item.fullSizeUrl,
    }));
}

/**
 * Parse feature names from the hotspots API response.
 * API: GET /car/api/hotspots/{stockNumber}
 */
export function parseFeatures(hotspots: Array<{ title: string; hotspotType: string }>): string[] {
  return hotspots.filter((h) => h.hotspotType === 'Feature').map((h) => h.title);
}
