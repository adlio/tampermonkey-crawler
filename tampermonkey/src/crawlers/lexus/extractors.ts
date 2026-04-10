import type {
  LexusRawListing,
  LexusVehicleData,
  LexusCPOListing,
  ExtractionResult,
  ExtractionError,
} from './types.js';

export const RESULTS_CONTAINER_SELECTOR = '[data-testid="TileGrid"]';

const VIN_FROM_ARIA = /^([A-HJ-NPR-Z0-9]{17})-compare/;
const VIN_FROM_HEART_ID = /inv-([A-HJ-NPR-Z0-9]{17})-/;

export function extractVin(card: Element): string | null {
  // Primary: compare toggle aria-label (a11y contract, more durable)
  const compareInput = card.querySelector('input[aria-label$="-compare-vehicle-toggle"]');
  if (compareInput) {
    const label = compareInput.getAttribute('aria-label') ?? '';
    const match = label.match(VIN_FROM_ARIA);
    if (match) return match[1];
  }
  // Fallback: DGSaveHeart id
  const heartEl = card.querySelector('[data-testid="DGSaveHeart"]');
  if (!heartEl) return null;
  const id = heartEl.getAttribute('id') ?? '';
  const match = id.match(VIN_FROM_HEART_ID);
  return match ? match[1] : null;
}

export function extractListing(card: Element): LexusRawListing | null {
  const vin = extractVin(card);
  if (!vin) return null;

  const titleEl = card.querySelector('[data-testid="VehicleTileNameBase"]');
  const title = titleEl?.textContent?.trim() ?? '';
  if (!title) return null;

  const priceEl = card.querySelector('[data-testid="PriceBase"]');
  const price = priceEl?.textContent?.trim() ?? null;

  const dealerEl = card.querySelector('[data-testid="DealerBase"]');
  const dealer = dealerEl?.textContent?.trim() ?? null;

  const tagsEl = card.querySelector('[data-testid="VehicleTagsBase"]');
  const tags = tagsEl?.textContent?.trim() ?? null;

  // Monogram is Lexus's equivalent of Toyota SmartPath
  const statusEl = card.querySelector('[data-testid="StatusMatchBase"]');
  const statusText = statusEl?.textContent?.trim() ?? '';
  const isMonogram = statusText.toLowerCase().includes('monogram');

  const imgEl = card.querySelector('[data-testid="JellyCarouselBase"] img');
  const imageUrl = imgEl?.getAttribute('src') ?? null;

  return {
    vin,
    title,
    price,
    dealer,
    tags,
    isMonogram,
    imageUrl,
  };
}

export function extractAllListings(root: Element | Document): ExtractionResult<LexusRawListing> {
  const items: LexusRawListing[] = [];
  const errors: ExtractionError[] = [];

  const container = root.querySelector(RESULTS_CONTAINER_SELECTOR);
  if (!container) return { items, errors };

  const cards = container.children;

  Array.from(cards).forEach((card, index) => {
    try {
      const result = extractListing(card);
      if (result) {
        items.push(result);
      } else {
        errors.push({
          index,
          selector: RESULTS_CONTAINER_SELECTOR,
          message: 'Missing VIN or title',
        });
      }
    } catch (err) {
      errors.push({
        index,
        selector: RESULTS_CONTAINER_SELECTOR,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return { items, errors };
}

export function matchesLexus(url: string): boolean {
  return /lexus\.com\/(search-inventory|lcertified\/search-inventory)(\/|$|\?)/.test(url);
}

export function parseVehicleData(data: unknown): LexusVehicleData | null {
  if (!data || typeof data !== 'object') return null;

  const v = data as Record<string, any>;
  if (!v.vin || typeof v.vin !== 'string') return null;
  if (!v.name || typeof v.name !== 'string') return null;

  return {
    vin: v.vin,
    name: v.name,
    marketingSeries: v.marketingSeries ?? '',
    year: v.year ?? '',
    model: v.model ?? '',
    trim:
      v.trim && typeof v.trim === 'object'
        ? { value: v.trim.value ?? '', code: v.trim.code ?? '' }
        : null,
    stockNum: v.stockNum ?? null,
    mileage: typeof v.mileage === 'number' ? v.mileage : null,
    description: v.description ?? null,
    isElectric: v.isElectric ?? false,
    isPreSold: v.isPreSold ?? false,
    isSmartPath: v.isSmartPath ?? false,
    engine:
      v.engine && typeof v.engine === 'object'
        ? { value: v.engine.value ?? '', code: v.engine.code ?? '' }
        : null,
    fuelType:
      v.fuelType && typeof v.fuelType === 'object'
        ? { code: v.fuelType.code ?? '', value: v.fuelType.value ?? '' }
        : null,
    drivetrain:
      v.drivetrain && typeof v.drivetrain === 'object'
        ? { value: v.drivetrain.value ?? '', code: v.drivetrain.code ?? '' }
        : null,
    baseMsrp: typeof v.baseMsrp === 'number' ? v.baseMsrp : null,
    msrp: typeof v.msrp === 'number' ? v.msrp : null,
    price: typeof v.price === 'number' ? v.price : null,
    priceData:
      v.priceData && typeof v.priceData === 'object'
        ? {
            advertizedPrice: v.priceData.advertizedPrice ?? null,
            nonSpAdvertizedPrice: v.priceData.nonSpAdvertizedPrice ?? null,
            totalMsrp: v.priceData.totalMsrp ?? null,
            sellingPrice: v.priceData.sellingPrice ?? null,
            dph: v.priceData.dph ?? null,
            dioTotalMsrp: v.priceData.dioTotalMsrp ?? null,
            dioTotalDealerSellingPrice: v.priceData.dioTotalDealerSellingPrice ?? null,
            dealerCashApplied: v.priceData.dealerCashApplied ?? null,
            baseMsrp: v.priceData.baseMsrp ?? null,
          }
        : null,
    dealer:
      v.dealer && typeof v.dealer === 'object'
        ? {
            value: v.dealer.value ?? '',
            code: v.dealer.code ?? '',
            name: v.dealer.name ?? '',
            distance: typeof v.dealer.distance === 'number' ? v.dealer.distance : null,
            isPMA: v.dealer.isPMA ?? false,
            isSmartPath: v.dealer.isSmartPath ?? false,
            dealerSiteURL: v.dealer.dealerSiteURL ?? null,
          }
        : null,
    extColor:
      v.extColor && typeof v.extColor === 'object'
        ? {
            value: v.extColor.value ?? '',
            label: v.extColor.label ?? '',
            hex: v.extColor.hex ?? null,
            code: v.extColor.code ?? '',
            colorFamilies: Array.isArray(v.extColor.colorFamilies) ? v.extColor.colorFamilies : [],
          }
        : null,
    intColor:
      v.intColor && typeof v.intColor === 'object'
        ? {
            value: v.intColor.value ?? '',
            label: v.intColor.label ?? '',
            code: v.intColor.code ?? '',
          }
        : null,
    jelly:
      v.jelly && typeof v.jelly === 'object'
        ? {
            image:
              v.jelly.image && typeof v.jelly.image === 'object'
                ? {
                    desktop:
                      v.jelly.image.desktop && typeof v.jelly.image.desktop === 'object'
                        ? { src: v.jelly.image.desktop.src ?? '' }
                        : null,
                  }
                : null,
          }
        : null,
    estMpg: v.estMpg ?? null,
    modelData:
      v.modelData && typeof v.modelData === 'object'
        ? {
            modelCd: v.modelData.modelCd ?? '',
            marketingName: v.modelData.marketingName ?? '',
            marketingTitle: v.modelData.marketingTitle ?? '',
          }
        : null,
    category: Array.isArray(v.category) ? v.category : [],
    inventoryStatus: v.inventoryStatus ?? null,
    href: v.href === false ? false : typeof v.href === 'string' ? v.href : false,
    vdpUrl: v.vdpUrl ?? null,
    options: Array.isArray(v.options)
      ? v.options
          .filter((o: any) => o && typeof o === 'object' && o.optionCd)
          .map((o: any) => ({ optionCd: o.optionCd, marketingName: o.marketingName ?? '' }))
      : [],
  };
}

// ---------------------------------------------------------------------------
// L/Certified (CPO) extractors — server-rendered DOM with data-testid attrs
// ---------------------------------------------------------------------------

export const CPO_CONTAINER_SELECTOR = '#LcertSearchInventory';
export const CPO_TILE_SELECTOR = '[data-testid="LCertInventoryTile"]';

const VIN_FROM_SETVIN = /setVin\]=([A-HJ-NPR-Z0-9]{17})/;

// Pattern matchers for identifying Typography elements by content, not position.
const YEAR_PREFIX_RE = /^\d{4}\s+/;
const MILEAGE_RE = /^[\d,]+\s+MILES$/i;
const PRICE_RE = /^\$/;

export function extractCPOListing(card: Element): LexusCPOListing | null {
  // VIN: extract from the VIEW DETAILS link href
  const detailLink = card.querySelector<HTMLAnchorElement>('[data-testid="LexusButton"]');
  const href = detailLink?.getAttribute('href') ?? '';
  const vinMatch = href.match(VIN_FROM_SETVIN);
  if (!vinMatch) return null;
  const vin = vinMatch[1];

  // Identify Typography elements by content patterns rather than position.
  // The live DOM has exactly 4 Typography elements per card, but their order
  // could theoretically change. Using content-based matching is more durable.
  const typographies = card.querySelectorAll('[data-testid="Typography"]');

  let titleEl: Element | null = null;
  let mileageText = '';
  let priceText = '';
  let dealer: string | null = null;

  for (const el of typographies) {
    const text = el.textContent?.trim() ?? '';
    if (!text) continue;

    if (YEAR_PREFIX_RE.test(text)) {
      titleEl = el;
    } else if (MILEAGE_RE.test(text)) {
      mileageText = text;
    } else if (PRICE_RE.test(text) || el.querySelector('[data-testid="DisclaimerTrigger"]')) {
      priceText = text;
    } else {
      // Remaining unmatched Typography is the dealer name
      dealer = text;
    }
  }

  const titleText = titleEl?.textContent?.trim() ?? '';
  if (!titleText) return null;

  // Parse year from the leading digits
  const yearMatch = titleText.match(/^(\d{4})\s+/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

  // Model + trim: the <span> inside the title contains "NX 300 F SPORT"
  const modelSpan = titleEl?.querySelector('span');
  const modelTrimText = modelSpan?.textContent?.trim() ?? '';
  // Split into model (first word or two) and trim (rest).
  // Model is the series name + number suffix (e.g. "NX 300", "RX 350", "RX 500h").
  // Trim is everything after (e.g. "F SPORT", "F SPORT HANDLING AWD").
  const modelTrimMatch = modelTrimText.match(/^(\S+\s+\S+?)(?:\s+(.+))?$/);
  const model = modelTrimMatch ? modelTrimMatch[1] : modelTrimText || null;
  const trim = modelTrimMatch?.[2] ?? null;

  // Mileage: "49,879 MILES" -> 49879
  const mileageMatch = mileageText.replace(/,/g, '').match(/^(\d+)\s+MILES$/i);
  const mileage = mileageMatch ? parseInt(mileageMatch[1], 10) : null;

  // Price: "$33,528*" -> 33528
  const priceMatch = priceText.replace(/,/g, '').match(/\$(\d+)/);
  const price = priceMatch ? parseInt(priceMatch[1], 10) : null;

  // Detail URL
  const detailUrl = href || null;

  // Image
  const imgEl = card.querySelector('img');
  const imageUrl = imgEl?.getAttribute('src') ?? null;

  return {
    vin,
    year,
    model,
    trim,
    mileage,
    price,
    dealer,
    detailUrl,
    imageUrl,
  };
}

export function extractAllCPOListings(root: Element | Document): ExtractionResult<LexusCPOListing> {
  const items: LexusCPOListing[] = [];
  const errors: ExtractionError[] = [];

  const container = root.querySelector(CPO_CONTAINER_SELECTOR);
  if (!container) return { items, errors };

  const cards = container.querySelectorAll(CPO_TILE_SELECTOR);
  if (cards.length === 0) return { items, errors };

  cards.forEach((card, index) => {
    try {
      const result = extractCPOListing(card);
      if (result) {
        items.push(result);
      } else {
        errors.push({
          index,
          selector: CPO_TILE_SELECTOR,
          message: 'Missing VIN or title',
        });
      }
    } catch (err) {
      errors.push({
        index,
        selector: CPO_TILE_SELECTOR,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return { items, errors };
}
