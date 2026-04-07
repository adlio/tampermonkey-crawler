import type {
  ToyotaRawListing,
  ToyotaVehicleData,
  ToyotaCPOVehicle,
  ToyotaPriceData,
  ToyotaDealerData,
  ToyotaColorData,
  ToyotaIntColorData,
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

export function extractListing(card: Element): ToyotaRawListing | null {
  const vin = extractVin(card);
  if (!vin) return null;

  const nameEl = card.querySelector('[data-testid="VehicleTileNameBase"]');
  const title = nameEl?.textContent?.trim() ?? '';
  if (!title) return null;

  // Parse year/model/trim from title like "Camry LE" or "2026 Camry LE"
  const yearMatch = title.match(/^(\d{4})\s+/);
  const year = yearMatch ? yearMatch[1] : null;
  const titleWithoutYear = yearMatch ? title.slice(yearMatch[0].length) : title;
  const parts = titleWithoutYear.split(/\s+/);
  const model = parts[0] ?? null;
  const trim = parts.length > 1 ? parts.slice(1).join(' ') : null;

  const priceEl = card.querySelector('[data-testid="PriceBaseToyota"]');
  const priceText = priceEl?.textContent?.trim() ?? null;
  let priceNumeric: number | null = null;
  if (priceText) {
    const priceMatch = priceText.replace(/,/g, '').match(/\$(\d+)/);
    priceNumeric = priceMatch ? parseInt(priceMatch[1], 10) : null;
  }

  const dealerEl = card.querySelector('[data-testid="DealerBaseToyota"]');
  const dealerText = dealerEl?.textContent?.trim() ?? null;

  const tagsEl = card.querySelector('[data-testid="VehicleTagsBase"]');
  const tags = tagsEl?.textContent?.trim() ?? null;

  const matchStatusEl = card.querySelector('[data-testid="StatusMatchToyotaBase"]');
  const matchStatus = matchStatusEl?.textContent?.trim() ?? null;

  const smartPathImg = card.querySelector('img[alt="Toyota smart path"]');
  const isSmartPath = !!smartPathImg;

  const buildPhaseEl = card.querySelector('[data-testid="BuildPhaseBase"]');
  const buildPhase = buildPhaseEl?.textContent?.trim() ?? null;

  const ctaEl = card.querySelector('[data-testid="CTASBase"] a');
  const link = ctaEl?.getAttribute('href') ?? null;

  const imgEl = card.querySelector('[data-testid="JellyCarouselBase"] img');
  const imageUrl = imgEl?.getAttribute('src') ?? null;

  return {
    vin,
    title,
    year,
    make: 'Toyota',
    model,
    trim,
    price: priceText,
    priceNumeric,
    dealerText,
    tags,
    matchStatus,
    isSmartPath,
    buildPhase,
    link,
    imageUrl,
  };
}

export function extractAllListings(root: Element | Document): ExtractionResult<ToyotaRawListing> {
  const items: ToyotaRawListing[] = [];
  const errors: ExtractionError[] = [];

  const container = root.querySelector(RESULTS_CONTAINER_SELECTOR);
  if (!container) return { items, errors };

  const cards = container.querySelectorAll(':scope > div');

  Array.from(cards).forEach((card, index) => {
    try {
      const result = extractListing(card);
      if (result) {
        items.push(result);
      } else {
        errors.push({
          index,
          selector: ':scope > div',
          message: 'Missing VIN or title',
        });
      }
    } catch (err) {
      errors.push({
        index,
        selector: ':scope > div',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return { items, errors };
}

export function matchesToyota(url: string): boolean {
  return /toyota\.com\/search-inventory/.test(url) || /toyotacertified\.com\/inventory/.test(url);
}

export function parseVehicleData(data: unknown): ToyotaVehicleData | null {
  if (!data || typeof data !== 'object') return null;

  const v = data as Record<string, any>;
  const vin = v.vin;
  if (typeof vin !== 'string' || !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return null;

  const priceData: ToyotaPriceData | null = v.priceData
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
    : null;

  const dealer: ToyotaDealerData | null = v.dealer
    ? {
        code: v.dealer.code ?? null,
        name: v.dealer.name ?? null,
        distance: v.dealer.distance ?? null,
        isPMA: v.dealer.isPMA ?? false,
        isSmartPath: v.dealer.isSmartPath ?? false,
        dealerSiteURL: v.dealer.dealerSiteURL ?? null,
      }
    : null;

  const extColor: ToyotaColorData | null = v.extColor
    ? {
        value: v.extColor.value ?? null,
        label: v.extColor.label ?? null,
        hex: v.extColor.hex ?? null,
        code: v.extColor.code ?? null,
        colorFamilies: Array.isArray(v.extColor.colorFamilies) ? v.extColor.colorFamilies : [],
      }
    : null;

  const intColor: ToyotaIntColorData | null = v.intColor
    ? {
        value: v.intColor.value ?? null,
        label: v.intColor.label ?? null,
        code: v.intColor.code ?? null,
      }
    : null;

  const imageUrl = v.jelly?.image?.desktop?.src ?? null;

  // Falls back to modelData.marketingName when trim.value is missing
  const trimValue = v.trim?.value ?? v.modelData?.marketingName ?? null;
  const trimCode = v.trim?.code ?? null;

  return {
    vin,
    name: v.name ?? null,
    marketingSeries: v.marketingSeries ?? null,
    year: v.year ?? null,
    model: v.model ?? null,
    trim: trimValue,
    trimCode,
    stockNum: v.stockNum ?? null,
    mileage: typeof v.mileage === 'number' ? v.mileage : null,
    description: v.description ?? null,
    isElectric: v.isElectric ?? false,
    isPreSold: v.isPreSold ?? false,
    isSmartPath: v.isSmartPath ?? false,
    engine: v.engine?.value ?? null,
    engineCode: v.engine?.code ?? null,
    fuelType: v.fuelType?.value ?? null,
    fuelTypeCode: v.fuelType?.code ?? null,
    drivetrain: v.drivetrain?.value ?? null,
    drivetrainCode: v.drivetrain?.code ?? null,
    baseMsrp: v.baseMsrp ?? null,
    msrp: v.msrp ?? null,
    price: v.price ?? null,
    priceData,
    dealer,
    extColor,
    intColor,
    imageUrl,
    estMpg: v.estMpg ?? null,
    category: Array.isArray(v.category) ? v.category : [],
    inventoryStatus: v.inventoryStatus ?? null,
    href: typeof v.href === 'string' ? v.href : null,
    vdpUrl: v.vdpUrl ?? null,
    options: Array.isArray(v.options) ? v.options : [],
  };
}

export function parseCPOVehicle(data: unknown): ToyotaCPOVehicle | null {
  if (!data || typeof data !== 'object') return null;

  const v = data as Record<string, any>;
  const vin = v.vin;
  if (typeof vin !== 'string' || !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return null;

  const year = typeof v.year === 'number' ? v.year : null;
  if (year == null) return null;

  const media = Array.isArray(v.media) ? v.media : [];
  const imageUrls: string[] = media
    .filter((m: any) => typeof m?.href === 'string' && m.href.length > 0 && m.visible !== false)
    .map((m: any) => m.href as string);

  const options: string[] = Array.isArray(v.options)
    ? v.options
        .filter((o: any) => typeof o?.marketingName === 'string')
        .map((o: any) => o.marketingName as string)
    : [];

  return {
    vin,
    stockNumber: v.stockNumber ?? null,
    year,
    marketingSeries: v.marketingSeries ?? null,
    model: v.model?.modelDescription ?? null,
    modelName: v.model?.modelName ?? null,
    modelYear: v.model?.modelYear ?? null,
    marketingTitle: v.model?.marketingTitle ?? null,
    grade: v.grade ?? null,
    mileage: typeof v.mileage === 'string' ? parseInt(v.mileage, 10) || null : null,
    certificationType: v.certificationType ?? null,
    certificationStatus: v.certificationStatus ?? null,
    bodyStyle: v.bodyStyle ?? null,
    brand: typeof v.brand === 'string' ? v.brand : 'TOYOTA',
    isPreviousRental: v.isPreviousRental ?? false,
    dealerCode: v.dealerCd ?? null,
    dealerName: v.owningDealerName ?? null,
    vehicleComments: v.vehicleComments ?? null,
    engineName: v.engine?.name ?? null,
    horsePower: v.engine?.horsePower ?? null,
    fuelType: v.engine?.marketingFuelType ?? null,
    cylinders: v.engine?.noOfCylinders ?? null,
    transmission: v.transmission?.transmissionDescription ?? null,
    drivetrain: v.drivetrain?.title ?? null,
    drivetrainCode: v.drivetrain?.code ?? null,
    sellingPrice: v.price?.sellingPrice ?? null,
    baseMsrp: v.price?.baseMsrp ?? null,
    totalMsrp: v.price?.totalMsrp ?? null,
    advertizedPrice: v.price?.advertizedPrice ?? null,
    extColorName: v.extColor?.marketingName ?? null,
    extColorHex: v.extColor?.hexCode ?? null,
    intColorName: v.intColor?.marketingName ?? null,
    mpgCity: v.mpg?.city ?? null,
    mpgHighway: v.mpg?.highway ?? null,
    mpgCombined: v.mpg?.combined ?? null,
    imageUrls,
    options,
    carfaxOneOwner: v.carFaxReport?.ownerHistory?.oneOwner ?? false,
    carfaxNoAccidents: v.carFaxReport?.accident?.hasAccidents === false,
    carfaxPersonalUse: v.carFaxReport?.useType?.isPersonalUse ?? false,
  };
}
