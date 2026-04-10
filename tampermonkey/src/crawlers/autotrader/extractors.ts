import type {
  AutoTraderRawListing,
  AutoTraderVehicleDetails,
  ExtractionResult,
  ExtractionError,
  VehicleSpec,
  VehicleImage,
  ElectricInfo,
} from './types.js';

/**
 * Real listing cards have both data-cmp="inventoryListing" and a data-qaid attribute.
 * Sponsored/spotlight cards use the same component but lack data-qaid,
 * so requiring it filters them out.
 */
export const CARD_SELECTOR = '[data-cmp="inventoryListing"][data-qaid]';

/**
 * The main results container. Cards outside this are supplemental/similar.
 */
export const RESULTS_CONTAINER_SELECTOR = '[data-cmp="cntnr-listings"]';

/**
 * Parse an AutoTrader listing title like "2025 Rivian R1S" into { year, make, model }.
 * The card heading only shows year + make + model (trim is in specs).
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
 * Parse a price string like "77,990" (no dollar sign) into a number.
 */
export function parsePrice(text: string | null): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[^0-9]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

/**
 * Extract structured data from a single AutoTrader listing card.
 * Pure function — no side effects, no network calls.
 */
export function extractListing(card: Element): AutoTraderRawListing | null {
  const listingId = card.id;
  if (!listingId) return null;

  const headingEl = card.querySelector('h2[data-cmp="subheading"]');
  const title = headingEl?.textContent?.trim() ?? '';
  if (!title) return null;

  const { year, make, model } = parseTitle(title);

  const linkEl = card.querySelector('a[data-cmp="link"]');
  const link = linkEl?.getAttribute('href') ?? null;

  const conditionEl = card.querySelector('[data-cmp="listingCondition"]');
  const condition = conditionEl?.textContent?.trim() ?? null;

  // Specs list: positional — first <li> is trim, second is mileage.
  // No aria-labels or data-cmp on individual <li> elements (verified Apr 2026).
  // We validate mileage with a regex and swap if the positions are reversed.
  const specItems = card.querySelectorAll('[data-cmp="listingSpecifications"] li');
  const rawFirst = specItems[0]?.textContent?.trim() ?? null;
  const rawSecond = specItems[1]?.textContent?.trim() ?? null;
  const MILEAGE_RE = /^\d[\d,]*K?\s*mi$/i;
  const positionsSwapped =
    rawFirst !== null && MILEAGE_RE.test(rawFirst) && !MILEAGE_RE.test(rawSecond ?? '');
  const trim = positionsSwapped ? rawSecond : rawFirst;
  const mileage = positionsSwapped ? rawFirst : rawSecond;

  // Fuel type: class-based selector — no data-cmp alternative exists (verified Apr 2026).
  // Only present for Electric/Hybrid vehicles; gasoline listings omit this element entirely.
  const fuelTypeEl = card.querySelector('.fuel-type');
  const fuelType = fuelTypeEl?.textContent?.trim() ?? null;

  const priceEl = card.querySelector('[data-cmp="firstPrice"]');
  const price = parsePrice(priceEl?.textContent?.trim() ?? null);

  const imgEl = card.querySelector('img[data-cmp="inventoryImage"]');
  const imageUrl = imgEl?.getAttribute('src') ?? null;

  // Badges
  const isPriceDrop = !!card.querySelector('[data-cmp="reducedPrice"]');
  const isNewlyListed = !!card.querySelector('[data-cmp="newlyListed"]');

  const vhrBadgeEl = card.querySelector('[data-cmp="VHRBadge"]');
  const vhrBadge = vhrBadgeEl?.textContent?.trim() || null;

  // Dealer info in footer.
  // Dealer name: class-based selector — no data-cmp alternative exists (verified Apr 2026).
  // Path: [data-cmp="cntnr-listing-footer"] > .text-left > .text-subdued > .ellipsis-truncated
  const footerEl = card.querySelector('[data-cmp="cntnr-listing-footer"]');
  const dealerNameEl = footerEl?.querySelector('.ellipsis-truncated');
  const dealerName = dealerNameEl?.textContent?.trim() ?? null;

  const distanceEl = card.querySelector('[data-cmp="ownerDistance"]');
  const dealerDistance = distanceEl?.textContent?.trim() ?? null;

  return {
    listingId,
    title,
    year,
    make,
    model,
    trim,
    price,
    mileage,
    link,
    imageUrl,
    condition,
    fuelType,
    dealerName,
    dealerDistance,
    isPriceDrop,
    isNewlyListed,
    vhrBadge,
  };
}

/**
 * Extract all AutoTrader listings from a root element or document.
 * Scopes to the results container to exclude supplemental/similar listings.
 */
export function extractAllListings(
  root: Element | Document,
): ExtractionResult<AutoTraderRawListing> {
  const items: AutoTraderRawListing[] = [];
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
          message: 'Missing listing ID or title',
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
 * Check whether a URL matches AutoTrader search results.
 * Matches /cars-for-sale/ paths but NOT /cars-for-sale/vehicle/ (detail page).
 */
export function matchesAutoTrader(url: string): boolean {
  return /autotrader\.com\/cars-for-sale\/(?!vehicle\/)/.test(url);
}

/**
 * Parse the __NEXT_DATA__ JSON from a detail page's HTML.
 * Returns the first inventory item found.
 */
export function parseDetailPageHtml(html: string): AutoTraderVehicleDetails | null {
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

  const inventory = data?.props?.pageProps?.__eggsState?.inventory;
  if (!inventory || typeof inventory !== 'object') return null;

  const vehicles = Object.values(inventory);
  if (vehicles.length === 0) return null;

  // Find the vehicle matching the page (first with a VIN, or just the first)
  const vehicle = (vehicles as any[]).find((v: any) => v.vin) ?? vehicles[0];
  return parseVehicleInventory(vehicle as any);
}

/**
 * Parse an inventory object from __NEXT_DATA__ into our typed structure.
 */
export function parseVehicleInventory(v: any): AutoTraderVehicleDetails {
  const specs: VehicleSpec[] = [];

  // Build specs from the specifications object
  if (v.specifications && typeof v.specifications === 'object') {
    for (const spec of Object.values(v.specifications) as any[]) {
      if (spec.label && spec.value) {
        specs.push({ label: spec.label, value: spec.value });
      }
    }
  }

  // Add supplementary specs from structured fields if not already present
  const specFields: [string, string | null | undefined][] = [
    ['Body Style', v.bodyStyles?.[0]?.name],
    ['Exterior Color', v.color?.exteriorColor],
    ['Interior Color', v.color?.interiorColor],
    ['Drive Type', v.driveType?.description],
    ['Engine', v.engine?.name],
    ['Fuel Type', v.fuelType?.name],
    ['Transmission', v.transmission?.description],
    ['Doors', v.doors],
    ['Seating', v.seatCount ? String(v.seatCount) : null],
  ];

  const existingLabels = new Set(specs.map((s) => s.label));
  for (const [label, value] of specFields) {
    if (value && !existingLabels.has(label)) {
      specs.push({ label, value });
    }
  }

  // Parse electric component info
  let electricInfo: ElectricInfo | null = null;
  const eci = v.electricComponentInfo;
  if (eci) {
    electricInfo = {
      batteryRange: eci.batteryRange ?? null,
      batteryType: eci.batteryType ?? null,
      batteryCapacity: eci.batteryCapacity ?? null,
      batteryEnergyCapacity: eci.batteryEnergyCapacity ?? null,
      batteryEfficiencyCity: eci.batteryEfficiencyCity ?? null,
      batteryEfficiencyHighway: eci.batteryEfficiencyHighway ?? null,
      batteryEfficiencyCombined: eci.batteryEfficiencyCombined ?? null,
      batteryMaximumChargeRate: eci.batteryMaximumChargeRate ?? null,
      chargingLevelMax: eci.chargingLevelMax ?? null,
      chargingPortSide: eci.chargingPortSide ?? null,
      connectorTypes: eci.connectorTypes ?? null,
      electricMotorCount: eci.electricMotorCount ?? null,
      epaChargeTimeAt240V: eci.epaChargeTimeAt240V ?? null,
    };
  }

  // Parse image manifest
  const imageManifest: VehicleImage[] = [];
  if (v.images?.sources && Array.isArray(v.images.sources)) {
    for (const [i, img] of v.images.sources.entries()) {
      if (img.src) {
        imageManifest.push({
          name: img.alt || `image-${i}`,
          src: img.src,
          width: img.width ?? null,
          height: img.height ?? null,
        });
      }
    }
  }

  // Parse pricing history
  const pricingHistory: { dateUpdated: string; price: string }[] = [];
  if (Array.isArray(v.pricingHistory)) {
    for (const entry of v.pricingHistory) {
      if (entry.dateUpdated && entry.price) {
        pricingHistory.push({ dateUpdated: entry.dateUpdated, price: entry.price });
      }
    }
  }

  return {
    listingId: v.id,
    vin: v.vin ?? null,
    stockId: v.stockId ?? null,
    year: v.year,
    make: v.make?.name ?? v.make ?? '',
    model: v.model?.name ?? v.model ?? '',
    trim: v.trim?.name ?? v.atTrim ?? null,
    title: v.title ?? '',
    listingType: v.listingType ?? null,
    price: v.pricingDetail?.salePrice ?? null,
    mileage: v.mileage?.value ?? null,
    bodyStyle: v.bodyStyles?.[0]?.name ?? null,
    exteriorColor: v.color?.exteriorColor ?? null,
    exteriorColorSimple: v.color?.exteriorColorSimple ?? null,
    interiorColor: v.color?.interiorColor ?? null,
    driveType: v.driveType?.description ?? null,
    engine: v.engine?.name ?? null,
    fuelType: v.fuelType?.name ?? null,
    transmission: v.transmission?.description ?? null,
    doors: v.doors ?? null,
    electricVehicleRange: v.electricVehicleRange ?? null,
    electricInfo,
    isReducedPrice: v.isReducedPrice ?? false,
    isNewlyListed: v.isNewlyListed ?? false,
    isHot: v.isHot ?? false,
    daysOnSite: v.daysOnSite ?? null,
    ownerName: v.ownerName ?? null,
    vhrPreview: Array.isArray(v.vhrPreview) ? v.vhrPreview : [],
    pricingHistory,
    specs,
    imageManifest,
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
