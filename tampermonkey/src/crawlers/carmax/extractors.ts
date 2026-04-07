import type {
  CarMaxRawListing,
  ExtractionResult,
  ExtractionError,
  VehicleSpec,
  VehicleImage,
} from './types.js';

/**
 * The root card element has both data-id (stock number) and data-clickprops
 * (structured metadata). This distinguishes real listings from recommendation
 * carousel items or other UI elements that share the kmx-car-tile class.
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
 * Extract structured data from a single CarMax listing card.
 * Pure function — no side effects, no network calls.
 */
export function extractListing(card: Element): CarMaxRawListing | null {
  const stockNumber = card.getAttribute('data-id');
  if (!stockNumber) return null;

  const titleLink = card.querySelector('.kmx-car-tile__make-model-link a, h3 a');
  const title = titleLink?.textContent?.trim() ?? '';
  if (!title) return null;

  const clickpropsRaw = card.getAttribute('data-clickprops') ?? '';
  const props = parseClickProps(clickpropsRaw);

  const { year, make, model, trim } = parseTitle(title);

  const priceEl = card.querySelector('.price-info .MuiTypography-h6');
  const price = priceEl?.textContent?.trim() ?? null;
  const priceNumeric = props['Price'] ? parseInt(props['Price'], 10) : null;

  const mileageEl = card.querySelector('.mileage-info');
  const mileage = mileageEl?.textContent?.trim() ?? null;

  const link = titleLink?.getAttribute('href') ?? null;

  const imgEl = card.querySelector('.kmx-car-tile__image-gallery img') as HTMLImageElement | null;
  const imageUrl = imgEl?.getAttribute('src') ?? null;

  const locationSpans = card.querySelectorAll('.kmx-car-tile__location-info span');
  const locationParts = Array.from(locationSpans).map((s) => s.textContent?.trim() ?? '');
  const location = locationParts.join('') || null;

  // Parse shipping cost from location text like "$549 Shipping | Est. arrival ..."
  const shippingMatch = locationParts.join('').match(/\$[\d,]+\s*Shipping/);
  const shippingCost = shippingMatch ? shippingMatch[0] : null;

  const monthlyEl = card.querySelector('.kmx-car-tile__post-calculator-terms .MuiTypography-h6');
  const monthlyEstimate = monthlyEl?.textContent?.trim() ?? null;

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
 */
export function extractVinFromHtml(html: string): string | null {
  const vinMatch = html.match(
    /class="tombstone-vin[^"]*"[^>]*>[\s\S]*?<span[^>]*>VIN<\/span>\s*<span[^>]*>([A-HJ-NPR-Z0-9]{17})<\/span>/i,
  );
  return vinMatch?.[1] ?? html.match(/VIN[\s\S]*?([A-HJ-NPR-Z0-9]{17})/)?.[1] ?? null;
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
