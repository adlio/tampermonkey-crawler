import type {
  CarvanaRawListing,
  CarvanaVehicleDetails,
  ExtractionResult,
  ExtractionError,
  VehicleSpec,
  VehicleImage,
  VehicleFeature,
} from './types.js';

/**
 * Carvana listing cards use data-testid="result-tile" as the root element.
 * Each contains an <a> with href="/vehicle/{id}" and data-native-payload JSON.
 */
export const CARD_SELECTOR = '[data-testid="result-tile"]';

/**
 * The main results container that scopes real listings.
 * Carvana currently doesn't mix recommendations into search results,
 * but scoping to #results-section is defensive.
 */
export const RESULTS_CONTAINER_SELECTOR = '#results-section';

/**
 * Parse the data-native-payload JSON attribute from a card's link.
 * Returns the vehicleId as a string, or null if missing.
 */
export function parseNativePayload(raw: string): { vehicleId: string } | null {
  try {
    const data = JSON.parse(raw);
    if (data.vehicleId) return { vehicleId: String(data.vehicleId) };
  } catch {
    // ignore
  }
  return null;
}

/**
 * Parse a Carvana listing title like "2025 Rivian R1S" into { year, make, model }.
 * The title on the card only has year + make + model (trim is in a separate element).
 */
export function parseTitle(title: string): {
  year: number | null;
  make: string | null;
  model: string | null;
} {
  const match = title.match(/^(\d{4})\s+(\S+)\s+(.+)$/);
  if (!match) return { year: null, make: null, model: null };
  return {
    year: parseInt(match[1], 10),
    make: match[2],
    model: match[3].trim(),
  };
}

/**
 * Extract a numeric price from a string like "$73,590".
 */
export function parsePrice(text: string | null): number | null {
  if (!text) return null;
  const match = text.replace(/,/g, '').match(/\$(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Parse battery pack size from a Rivian trim string.
 * Trim patterns: "Dual Standard Dual-Motor", "Dual Large Dual-Motor", "Dual Max Dual-Motor".
 * Returns "Standard", "Large", "Max", or null for non-Rivian / unrecognized trims.
 */
export function parseBatteryPack(trim: string | null): string | null {
  if (!trim) return null;
  const match = trim.match(/\b(Standard|Large|Max)\b/);
  return match ? match[1] : null;
}

/**
 * Extract structured data from a single Carvana listing card.
 * Pure function — no side effects, no network calls.
 */
export function extractListing(card: Element): CarvanaRawListing | null {
  const link = card.querySelector('a[href*="/vehicle/"]');
  if (!link) return null;

  const payloadRaw = link.getAttribute('data-native-payload') ?? '';
  const payload = parseNativePayload(payloadRaw);
  if (!payload) return null;

  const vehicleId = payload.vehicleId;
  const href = link.getAttribute('href');

  const makeModelEl = card.querySelector('[data-testid="make-model"]');
  const title = makeModelEl?.textContent?.trim() ?? '';
  if (!title) return null;

  const { year, make, model } = parseTitle(title);

  const trimMileageEl = card.querySelector('[data-testid="trim-mileage"]');
  const trimEl = trimMileageEl?.querySelector('p');
  const trim = trimEl?.textContent?.trim() ?? null;
  const mileageSpan = trimMileageEl?.querySelector('span');
  const mileage = mileageSpan?.textContent?.trim() ?? null;

  const priceEl = card.querySelector('[data-testid="price"]');
  const price = priceEl?.textContent?.trim() ?? null;
  const priceNumeric = parsePrice(price);

  const originalPriceEl = card.querySelector('[data-testid="original-price"]');
  const originalPrice =
    originalPriceEl?.textContent?.trim()?.replace(/ - Original Price\s*$/, '') ?? null;

  const monthlyEl = card.querySelector('[data-testid="monthly-payment"]');
  const monthlyPayment = monthlyEl?.textContent?.trim() ?? null;

  const downPaymentEl = card.querySelector('[data-testid="down-payment"]');
  const downPayment = downPaymentEl?.getAttribute('data-down-payment') ?? null;

  const shippingEl = card.querySelector('[data-testid="shipping-cost"]');
  const shippingCost = shippingEl?.textContent?.trim() ?? null;

  const freeShippingEl = card.querySelector('[data-testid="free-shipping"]');
  const isFreeShipping = !!freeShippingEl;

  const getItByEl = card.querySelector('[data-testid="get-it-by"]');
  const deliveryEstimate = getItByEl?.textContent?.trim() ?? null;

  const imgEl = card.querySelector('img[data-testid="vehicle-image"]');
  const imageUrl = imgEl?.getAttribute('src') ?? null;

  // Deal tags
  const tagsWrapper = card.querySelector('[data-testid="deal-tags-wrapper"]');
  const tagTexts = tagsWrapper?.textContent?.trim() ?? '';
  const isPriceDrop = tagTexts.includes('Price Drop');
  const isGreatDeal = tagTexts.includes('Great Deal');

  // Status tag: "Purchase in progress", "Pre-order now", "Recent"
  const statusTagEl = card.querySelector('[data-testid="status-tag-wrapper"]');
  const statusTag = statusTagEl?.textContent?.trim() || null;

  // Battery pack size parsed from trim (e.g. "Dual Large Dual-Motor" → "Large")
  const batteryPack = parseBatteryPack(trim);

  return {
    vehicleId,
    title,
    year,
    make,
    model,
    trim,
    price,
    priceNumeric,
    originalPrice,
    mileage,
    link: href,
    imageUrl,
    monthlyPayment,
    downPayment,
    shippingCost,
    isFreeShipping,
    deliveryEstimate,
    isPriceDrop,
    isGreatDeal,
    statusTag,
    batteryPack,
  };
}

/**
 * Extract all Carvana listings from a root element or document.
 * Scopes to #results-section to exclude any non-listing content.
 */
export function extractAllListings(root: Element | Document): ExtractionResult<CarvanaRawListing> {
  const items: CarvanaRawListing[] = [];
  const errors: ExtractionError[] = [];

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
          message: 'Missing vehicle ID or title',
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
 * Check whether a URL matches Carvana search results.
 * Matches /cars (search results) but not /vehicle/ (detail page).
 */
export function matchesCarvana(url: string): boolean {
  return /carvana\.com\/cars(\/|$|\?)/.test(url);
}

/**
 * Extract vehicle details from a Carvana detail page's HTML.
 * Parses the __NEXT_DATA__ JSON embedded in the page.
 */
export function parseDetailPageHtml(html: string): CarvanaVehicleDetails | null {
  const match = html.match(
    /<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match) return null;

  let data: any;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return null;
  }

  const vd = data?.props?.pageProps?.forProviders?.forVehicleContext?.vehicleDetails;
  if (!vd) return null;

  return parseVehicleDetails(vd);
}

/**
 * Parse the vehicleDetails object from __NEXT_DATA__ into our typed structure.
 */
export function parseVehicleDetails(vd: any): CarvanaVehicleDetails {
  const specs: VehicleSpec[] = [];

  // Build specs from the available fields
  const specFields: [string, string | null][] = [
    ['Body Type', vd.bodyType],
    ['Exterior Color', vd.exteriorColor],
    ['Interior Color', vd.interiorColor],
    ['Drivetrain', vd.drivetrainDescription],
    ['Engine', vd.engineDescription],
    ['Transmission', vd.transmission],
    ['Fuel Type', vd.fuelDescription],
    ['Horsepower', vd.horsePower ? String(vd.horsePower) : null],
    ['EV Range', vd.evRange ? `${vd.evRange} miles` : null],
    ['Seating', vd.seating ? String(vd.seating) : null],
    ['Doors', vd.doors ? String(vd.doors) : null],
    ['Curb Weight', vd.curbWeight ? `${vd.curbWeight} lbs` : null],
    ['Wheelbase', vd.wheelbase ? `${vd.wheelbase} in` : null],
    ['Tow Capacity', vd.towCapacity ? `${vd.towCapacity} lbs` : null],
    ['Ground Clearance', vd.groundClearance ? `${vd.groundClearance} in` : null],
    ['MPGe City', vd.evMpgeCity ? String(vd.evMpgeCity) : null],
    ['MPGe Highway', vd.evMpgeHighway ? String(vd.evMpgeHighway) : null],
  ];

  for (const [label, value] of specFields) {
    if (value) specs.push({ label, value });
  }

  // Parse features from vexVdpImageData
  const vexFeatures = vd.vexVdpImageData?.features;
  const features: VehicleFeature[] = Array.isArray(vexFeatures)
    ? vexFeatures.map((f: any) => ({
        title: f.title,
        location: f.location ?? 'unknown',
        imageUrl: f.imageUrl ?? null,
      }))
    : [];

  // Parse image manifest from vexVdpImageData
  const imageManifest: VehicleImage[] = [];
  const vex = vd.vexVdpImageData;
  if (vex) {
    // Hero image
    if (vex.heroes?.hero) {
      imageManifest.push({ name: 'hero', category: 'hero', imageUrl: vex.heroes.hero });
    }
    // Feature images
    if (Array.isArray(vex.features)) {
      for (const f of vex.features) {
        if (f.imageUrl) {
          imageManifest.push({
            name: `feature-${f.title?.replace(/\s+/g, '-').toLowerCase() ?? 'unknown'}`,
            category: f.location ?? 'feature',
            imageUrl: f.imageUrl,
          });
        }
      }
    }
    // Cutout/jellybean images
    if (Array.isArray(vex.cutouts)) {
      for (const [i, c] of vex.cutouts.entries()) {
        if (c.desktopURL) {
          imageManifest.push({ name: `cutout-${i}`, category: 'cutout', imageUrl: c.desktopURL });
        }
      }
    }
    // Imperfection images
    if (Array.isArray(vex.imperfections)) {
      for (const [i, imp] of vex.imperfections.entries()) {
        if (imp.imageUrl) {
          imageManifest.push({
            name: `imperfection-${i}`,
            category: 'imperfection',
            imageUrl: imp.imageUrl,
          });
        }
      }
    }
  }

  const highlights: string[] = Array.isArray(vd.highlights)
    ? vd.highlights.filter((h: any) => h.tagName).map((h: any) => h.tagName)
    : [];

  return {
    vehicleId: vd.vehicleId,
    stockNumber: vd.stockNumber ?? null,
    vin: vd.vin ?? null,
    year: vd.year,
    make: vd.make,
    model: vd.model,
    trim: vd.trim ?? null,
    price: vd.price ?? null,
    mileage: vd.mileage ?? null,
    bodyType: vd.bodyType ?? null,
    exteriorColor: vd.exteriorColor ?? null,
    interiorColor: vd.interiorColor ?? null,
    drivetrain: vd.drivetrainDescription ?? null,
    engine: vd.engineDescription ?? null,
    transmission: vd.transmission ?? null,
    fuelType: vd.fuelDescription ?? null,
    horsepower: vd.horsePower ?? null,
    evRange: vd.evRange ?? null,
    seating: vd.seating ?? null,
    doors: vd.doors ?? null,
    saleStatus: vd.saleStatus ?? null,
    location: vd.location ? { city: vd.location.city, state: vd.location.stateAbbreviation } : null,
    specs,
    features,
    imageManifest,
    highlights,
  };
}

/**
 * Extract VIN from detail page HTML via __NEXT_DATA__.
 * Falls back to regex search if __NEXT_DATA__ parsing fails.
 */
export function extractVinFromHtml(html: string): string | null {
  const details = parseDetailPageHtml(html);
  if (details?.vin) return details.vin;

  // Fallback: regex search for VIN pattern
  const vinMatch = html.match(/"vin"\s*:\s*"([A-HJ-NPR-Z0-9]{17})"/i);
  return vinMatch?.[1] ?? null;
}
