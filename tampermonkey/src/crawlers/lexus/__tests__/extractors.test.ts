import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  extractVin,
  extractListing,
  extractAllListings,
  matchesLexus,
  parseVehicleData,
  extractCPOListing,
  extractAllCPOListings,
} from '../extractors.js';

let doc: Document;

beforeAll(() => {
  const html = readFileSync(resolve(__dirname, '../__fixtures__/lexus-results.html'), 'utf-8');
  document.body.innerHTML = html;
  doc = document;
});

describe('extractVin', () => {
  it('extracts VIN from compare toggle aria-label (primary)', () => {
    const card = doc.querySelector('[data-testid="TileGrid"]')!.children[0];
    expect(extractVin(card)).toBe('2T2BAMCA4TC137546');
  });

  it('falls back to DGSaveHeart id when aria-label is missing', () => {
    const card = document.createElement('div');
    card.innerHTML =
      '<div data-testid="DGSaveHeart" id="dg-inline-saves-inv-2T2BAMCA4TC137546-vehicle-tile"></div>';
    expect(extractVin(card)).toBe('2T2BAMCA4TC137546');
  });

  it('returns null when neither source is present', () => {
    const card = document.createElement('div');
    card.innerHTML = '<div data-testid="VehicleTileNameBase">2026 RX 350</div>';
    expect(extractVin(card)).toBeNull();
  });

  it('returns null when DGSaveHeart id does not contain VIN', () => {
    const card = document.createElement('div');
    card.innerHTML =
      '<div data-testid="DGSaveHeart" id="dg-inline-saves-inv-SHORT-vehicle-tile"></div>';
    expect(extractVin(card)).toBeNull();
  });
});

describe('extractListing', () => {
  it('extracts all fields from a standard RX 350 card', () => {
    const card = doc.querySelector('[data-testid="TileGrid"]')!.children[0];
    const result = extractListing(card)!;
    expect(result.vin).toBe('2T2BAMCA4TC137546');
    expect(result.title).toBe('2026 RX 350');
    expect(result.price).toBe('$53,759');
    expect(result.dealer).toBe('Lexus of Portland (4 mi)');
    expect(result.tags).toBe('Gas AWD');
    expect(result.isMonogram).toBe(false);
    expect(result.imageUrl).toContain('media.rti.toyota.com');
  });

  it('detects Monogram dealer status', () => {
    const card = doc.querySelector('[data-testid="TileGrid"]')!.children[1];
    const result = extractListing(card)!;
    expect(result.vin).toBe('2T2HBMCA0TC200001');
    expect(result.title).toBe('2026 RX 350 Luxury');
    expect(result.isMonogram).toBe(true);
    expect(result.price).toBe('$58,250');
    expect(result.dealer).toBe('Kuni Lexus of Portland (6 mi)');
  });

  it('extracts in-transit vehicle card', () => {
    const card = doc.querySelector('[data-testid="TileGrid"]')!.children[2];
    const result = extractListing(card)!;
    expect(result.vin).toBe('JTJDWRCA5TA050099');
    expect(result.title).toBe('2026 NX 350h');
    expect(result.tags).toBe('Hybrid AWD');
    expect(result.isMonogram).toBe(false);
  });

  it('returns null for card without DGSaveHeart (no VIN)', () => {
    const card = doc.querySelector('[data-testid="TileGrid"]')!.children[3];
    expect(extractListing(card)).toBeNull();
  });

  it('returns null for card without title', () => {
    const card = document.createElement('div');
    card.innerHTML =
      '<div data-testid="DGSaveHeart" id="dg-inline-saves-inv-2T2BAMCA4TC137546-vehicle-tile"></div>';
    expect(extractListing(card)).toBeNull();
  });
});

describe('extractAllListings', () => {
  it('extracts only the 3 valid cards from TileGrid', () => {
    const result = extractAllListings(doc);
    expect(result.items.length).toBe(3);
  });

  it('reports error for card missing VIN', () => {
    const result = extractAllListings(doc);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].index).toBe(3);
    expect(result.errors[0].message).toBe('Missing VIN or title');
  });

  it('excludes cards outside TileGrid', () => {
    const result = extractAllListings(doc);
    const vins = result.items.map((l) => l.vin);
    expect(vins).toEqual(['2T2BAMCA4TC137546', '2T2HBMCA0TC200001', 'JTJDWRCA5TA050099']);
    // The IS 350 card outside the grid should not appear
    expect(vins).not.toContain('JTHBP1D20R5012345');
  });

  it('returns empty when TileGrid is not present', () => {
    const container = document.createElement('div');
    container.innerHTML = '<div>no grid here</div>';
    const result = extractAllListings(container);
    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});

describe('matchesLexus', () => {
  it('matches new inventory search URLs', () => {
    expect(
      matchesLexus('https://www.lexus.com/search-inventory/model/RX/?zipcode=97201&distance=50'),
    ).toBe(true);
    expect(matchesLexus('https://www.lexus.com/search-inventory')).toBe(true);
    expect(matchesLexus('https://www.lexus.com/search-inventory/')).toBe(true);
    expect(
      matchesLexus(
        'https://www.lexus.com/search-inventory/model/NX/?zipcode=97201&dealerDistance[]=12345',
      ),
    ).toBe(true);
  });

  it('matches L/Certified search URLs', () => {
    expect(matchesLexus('https://www.lexus.com/lcertified/search-inventory')).toBe(true);
    expect(matchesLexus('https://www.lexus.com/lcertified/search-inventory?foo=bar')).toBe(true);
  });

  it('rejects non-inventory URLs', () => {
    expect(matchesLexus('https://www.lexus.com/')).toBe(false);
    expect(matchesLexus('https://www.lexus.com/models/rx')).toBe(false);
    expect(matchesLexus('https://www.lexus.com/dealers')).toBe(false);
    expect(matchesLexus('https://www.google.com')).toBe(false);
    expect(matchesLexus('https://www.toyota.com/search-inventory')).toBe(false);
  });
});

/** Factory to build a vehicle data object with sensible defaults for testing. */
function makeVehicleData(overrides: Record<string, any> = {}) {
  return {
    vin: '2T2BAMCA4TC137546',
    name: '2026 RX 350',
    marketingSeries: 'RX',
    year: '2026',
    model: 'RX',
    trim: { value: 'RX 350', code: '9410-2026' },
    stockNum: 'TC137546',
    mileage: 0,
    description: 'Turbo in-line 4,  with AWD',
    isElectric: false,
    isPreSold: false,
    isSmartPath: false,
    engine: { value: 'Turbo in-line 4', code: 'TIL4' },
    fuelType: { code: 'G', value: 'Gas' },
    drivetrain: { value: 'AWD', code: 'awd' },
    baseMsrp: 51325,
    msrp: 53759,
    price: 53759,
    priceData: {
      advertizedPrice: null,
      nonSpAdvertizedPrice: 53759,
      totalMsrp: 53759,
      sellingPrice: null,
      dph: null,
      dioTotalMsrp: 0,
      dioTotalDealerSellingPrice: 0,
      dealerCashApplied: null,
      baseMsrp: 51325,
    },
    dealer: {
      value: 'Lexus of Portland (4 mi)',
      code: '63601',
      name: 'Lexus of Portland',
      distance: 4,
      isPMA: true,
      isSmartPath: false,
      dealerSiteURL: 'https://www.lexusofportland.com',
    },
    extColor: {
      value: 'Nightfall Mica',
      label: 'Nightfall Mica',
      hex: null,
      code: '08X5',
      colorFamilies: ['red', 'blue'],
    },
    intColor: {
      value: 'Black NuLuxe',
      label: 'Black NuLuxe',
      code: 'EA23',
    },
    jelly: {
      image: {
        desktop: {
          src: 'https://media.rti.toyota.com/adobe/assets/urn:aaid:aem:rx350/as/image.png?size=315,215',
        },
      },
    },
    estMpg: '21/28 est. mpg',
    modelData: {
      modelCd: '9410',
      marketingName: 'RX 350',
      marketingTitle: 'RX 350 AWD',
    },
    category: ['SUV'],
    inventoryStatus: '',
    href: false,
    vdpUrl: 'https://www.lexusofportland.com/inventory/new-2026-lexus-rx-350',
    options: [{ optionCd: 'CK', marketingName: 'Cold Area Package' }],
    ...overrides,
  };
}

describe('parseVehicleData', () => {
  it('parses a full vehicle object', () => {
    const result = parseVehicleData(makeVehicleData())!;
    expect(result).not.toBeNull();
    expect(result.vin).toBe('2T2BAMCA4TC137546');
    expect(result.name).toBe('2026 RX 350');
    expect(result.marketingSeries).toBe('RX');
    expect(result.year).toBe('2026');
    expect(result.model).toBe('RX');
    expect(result.trim).toEqual({ value: 'RX 350', code: '9410-2026' });
    expect(result.stockNum).toBe('TC137546');
    expect(result.mileage).toBe(0);
    expect(result.description).toBe('Turbo in-line 4,  with AWD');
    expect(result.isElectric).toBe(false);
    expect(result.isPreSold).toBe(false);
    expect(result.isSmartPath).toBe(false);
    expect(result.engine).toEqual({ value: 'Turbo in-line 4', code: 'TIL4' });
    expect(result.fuelType).toEqual({ code: 'G', value: 'Gas' });
    expect(result.drivetrain).toEqual({ value: 'AWD', code: 'awd' });
    expect(result.baseMsrp).toBe(51325);
    expect(result.msrp).toBe(53759);
    expect(result.price).toBe(53759);
    expect(result.priceData!.totalMsrp).toBe(53759);
    expect(result.priceData!.baseMsrp).toBe(51325);
    expect(result.dealer!.name).toBe('Lexus of Portland');
    expect(result.dealer!.code).toBe('63601');
    expect(result.dealer!.distance).toBe(4);
    expect(result.extColor!.value).toBe('Nightfall Mica');
    expect(result.extColor!.code).toBe('08X5');
    expect(result.extColor!.colorFamilies).toEqual(['red', 'blue']);
    expect(result.intColor!.value).toBe('Black NuLuxe');
    expect(result.jelly!.image!.desktop!.src).toContain('media.rti.toyota.com');
    expect(result.estMpg).toBe('21/28 est. mpg');
    expect(result.modelData!.modelCd).toBe('9410');
    expect(result.modelData!.marketingName).toBe('RX 350');
    expect(result.category).toEqual(['SUV']);
    expect(result.href).toBe(false);
    expect(result.vdpUrl).toContain('lexusofportland.com');
    expect(result.options).toHaveLength(1);
    expect(result.options[0].optionCd).toBe('CK');
  });

  it('returns null for null/undefined input', () => {
    expect(parseVehicleData(null)).toBeNull();
    expect(parseVehicleData(undefined)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(parseVehicleData('string')).toBeNull();
    expect(parseVehicleData(42)).toBeNull();
  });

  it('returns null when vin is missing', () => {
    expect(parseVehicleData(makeVehicleData({ vin: undefined }))).toBeNull();
  });

  it('returns null when name is missing', () => {
    expect(parseVehicleData(makeVehicleData({ name: undefined }))).toBeNull();
  });

  it('handles missing optional fields gracefully', () => {
    const result = parseVehicleData({
      vin: 'JTJDWRCA5TA050099',
      name: '2026 NX 350h',
    })!;
    expect(result).not.toBeNull();
    expect(result.vin).toBe('JTJDWRCA5TA050099');
    expect(result.name).toBe('2026 NX 350h');
    expect(result.trim).toBeNull();
    expect(result.stockNum).toBeNull();
    expect(result.mileage).toBeNull();
    expect(result.engine).toBeNull();
    expect(result.fuelType).toBeNull();
    expect(result.drivetrain).toBeNull();
    expect(result.baseMsrp).toBeNull();
    expect(result.msrp).toBeNull();
    expect(result.price).toBeNull();
    expect(result.priceData).toBeNull();
    expect(result.dealer).toBeNull();
    expect(result.extColor).toBeNull();
    expect(result.intColor).toBeNull();
    expect(result.jelly).toBeNull();
    expect(result.estMpg).toBeNull();
    expect(result.modelData).toBeNull();
    expect(result.category).toEqual([]);
    expect(result.inventoryStatus).toBeNull();
    expect(result.vdpUrl).toBeNull();
    expect(result.options).toEqual([]);
  });

  it('handles href as string when present', () => {
    const result = parseVehicleData(makeVehicleData({ href: '/some/path' }))!;
    expect(result.href).toBe('/some/path');
  });

  it('handles href as false', () => {
    const result = parseVehicleData(makeVehicleData({ href: false }))!;
    expect(result.href).toBe(false);
  });

  it('filters out invalid options', () => {
    const result = parseVehicleData(
      makeVehicleData({
        options: [{ optionCd: 'AB', marketingName: 'Opt A' }, null, { marketingName: 'No code' }],
      }),
    )!;
    expect(result.options).toHaveLength(1);
    expect(result.options[0].optionCd).toBe('AB');
  });
});

// ---------------------------------------------------------------------------
// L/Certified (CPO) extractors
// ---------------------------------------------------------------------------

/** Build a single CPO card HTML for testing. */
function makeCPOCardHtml(
  overrides: {
    vin?: string;
    year?: string;
    modelTrim?: string;
    mileage?: string;
    price?: string;
    dealer?: string;
    imageUrl?: string;
    invalidLink?: boolean;
  } = {},
): string {
  const vin = overrides.vin ?? 'JTJSARDZ4L2227037';
  const year = overrides.year ?? '2020';
  const modelTrim = overrides.modelTrim ?? 'NX 300 F SPORT';
  const mileage = overrides.mileage ?? '49,879 MILES';
  const price = overrides.price ?? '$33,528';
  const dealer = overrides.dealer ?? 'Lexus of Portland';
  const imageUrl =
    overrides.imageUrl ?? `https://lexus.assets.shiftdigitalinventory.com/images/${vin}_1.jpg`;
  const linkHref = overrides.invalidLink
    ? '?link[LcertSearchInventory][setVin]=INVALID'
    : `?link[LcertSearchInventory][setVin]=${vin}`;

  return `
    <div data-testid="LCertInventoryTile">
      <a href="${linkHref}" data-testid="Link">
        <img src="${imageUrl}" alt="" role="presentation">
      </a>
      <div>
        <div>
          <div>
            <div data-testid="Typography">${year} <span>${modelTrim}</span></div>
            <div data-testid="Typography">${mileage}</div>
          </div>
          <div data-testid="Typography">${price}<span data-testid="DisclaimerTrigger">*</span></div>
          <div data-testid="Typography">${dealer}</div>
        </div>
        <div>
          <a href="${linkHref}" aria-label="VIEW DETAILS" data-testid="LexusButton">VIEW DETAILS</a>
        </div>
      </div>
    </div>
  `;
}

describe('extractCPOListing', () => {
  it('extracts all fields from a standard NX 300 card', () => {
    const container = document.createElement('div');
    container.innerHTML = makeCPOCardHtml();
    const card = container.querySelector('[data-testid="LCertInventoryTile"]')!;
    const result = extractCPOListing(card)!;
    expect(result).not.toBeNull();
    expect(result.vin).toBe('JTJSARDZ4L2227037');
    expect(result.year).toBe(2020);
    expect(result.model).toBe('NX 300');
    expect(result.trim).toBe('F SPORT');
    expect(result.mileage).toBe(49879);
    expect(result.price).toBe(33528);
    expect(result.dealer).toBe('Lexus of Portland');
    expect(result.detailUrl).toBe('?link[LcertSearchInventory][setVin]=JTJSARDZ4L2227037');
    expect(result.imageUrl).toContain('shiftdigitalinventory.com');
  });

  it('extracts RX 350 with multi-word trim', () => {
    const container = document.createElement('div');
    container.innerHTML = makeCPOCardHtml({
      vin: '2T2BAMCA7PC034627',
      year: '2023',
      modelTrim: 'RX 350 F SPORT HANDLING AWD',
      mileage: '10,784 MILES',
      price: '$53,407',
    });
    const card = container.querySelector('[data-testid="LCertInventoryTile"]')!;
    const result = extractCPOListing(card)!;
    expect(result.vin).toBe('2T2BAMCA7PC034627');
    expect(result.year).toBe(2023);
    expect(result.model).toBe('RX 350');
    expect(result.trim).toBe('F SPORT HANDLING AWD');
    expect(result.mileage).toBe(10784);
    expect(result.price).toBe(53407);
  });

  it('returns null when VIN is invalid in the link', () => {
    const container = document.createElement('div');
    container.innerHTML = makeCPOCardHtml({ invalidLink: true });
    const card = container.querySelector('[data-testid="LCertInventoryTile"]')!;
    expect(extractCPOListing(card)).toBeNull();
  });

  it('returns null when LexusButton link is missing', () => {
    const card = document.createElement('div');
    card.setAttribute('data-testid', 'LCertInventoryTile');
    card.innerHTML = `
      <div data-testid="Typography">2020 <span>NX 300</span></div>
      <div data-testid="Typography">49,879 MILES</div>
      <div data-testid="Typography">$33,528</div>
      <div data-testid="Typography">Lexus of Portland</div>
    `;
    expect(extractCPOListing(card)).toBeNull();
  });

  it('handles missing mileage gracefully', () => {
    const container = document.createElement('div');
    container.innerHTML = makeCPOCardHtml({ mileage: '' });
    const card = container.querySelector('[data-testid="LCertInventoryTile"]')!;
    const result = extractCPOListing(card)!;
    expect(result).not.toBeNull();
    expect(result.mileage).toBeNull();
  });

  it('handles model with no trim', () => {
    const container = document.createElement('div');
    container.innerHTML = makeCPOCardHtml({ modelTrim: 'ES 350' });
    const card = container.querySelector('[data-testid="LCertInventoryTile"]')!;
    const result = extractCPOListing(card)!;
    expect(result.model).toBe('ES 350');
    expect(result.trim).toBeNull();
  });

  it('handles missing price gracefully', () => {
    const container = document.createElement('div');
    container.innerHTML = makeCPOCardHtml({ price: '' });
    const card = container.querySelector('[data-testid="LCertInventoryTile"]')!;
    const result = extractCPOListing(card)!;
    expect(result).not.toBeNull();
    expect(result.price).toBeNull();
  });

  it('handles missing dealer gracefully', () => {
    const container = document.createElement('div');
    container.innerHTML = makeCPOCardHtml({ dealer: '' });
    const card = container.querySelector('[data-testid="LCertInventoryTile"]')!;
    const result = extractCPOListing(card)!;
    expect(result).not.toBeNull();
    expect(result.dealer).toBeNull();
  });

  it('identifies price by DisclaimerTrigger even without $ prefix', () => {
    const container = document.createElement('div');
    // Price text that starts with a number but has DisclaimerTrigger child
    container.innerHTML = `
      <div data-testid="LCertInventoryTile">
        <a href="?link[LcertSearchInventory][setVin]=JTJSARDZ4L2227037" data-testid="Link">
          <img src="https://example.com/img.jpg" alt="" role="presentation">
        </a>
        <div>
          <div>
            <div>
              <div data-testid="Typography">2020 <span>NX 300 F SPORT</span></div>
              <div data-testid="Typography">49,879 MILES</div>
            </div>
            <div data-testid="Typography">33,528<span data-testid="DisclaimerTrigger">*</span></div>
            <div data-testid="Typography">Lexus of Portland</div>
          </div>
          <div>
            <a href="?link[LcertSearchInventory][setVin]=JTJSARDZ4L2227037" aria-label="VIEW DETAILS" data-testid="LexusButton">VIEW DETAILS</a>
          </div>
        </div>
      </div>
    `;
    const card = container.querySelector('[data-testid="LCertInventoryTile"]')!;
    const result = extractCPOListing(card)!;
    expect(result).not.toBeNull();
    // Price extraction should still work because we match the DisclaimerTrigger
    expect(result.dealer).toBe('Lexus of Portland');
  });

  it('extracts fields correctly when Typography order is shuffled', () => {
    const vin = 'JTJSARDZ4L2227037';
    const container = document.createElement('div');
    // Dealer, price, mileage, title — reversed from normal order
    container.innerHTML = `
      <div data-testid="LCertInventoryTile">
        <a href="?link[LcertSearchInventory][setVin]=${vin}" data-testid="Link">
          <img src="https://example.com/img.jpg" alt="" role="presentation">
        </a>
        <div>
          <div>
            <div data-testid="Typography">Kuni Lexus of Portland</div>
            <div data-testid="Typography">$42,000<span data-testid="DisclaimerTrigger">*</span></div>
            <div data-testid="Typography">30,000 MILES</div>
            <div data-testid="Typography">2021 <span>ES 350</span></div>
          </div>
          <div>
            <a href="?link[LcertSearchInventory][setVin]=${vin}" aria-label="VIEW DETAILS" data-testid="LexusButton">VIEW DETAILS</a>
          </div>
        </div>
      </div>
    `;
    const card = container.querySelector('[data-testid="LCertInventoryTile"]')!;
    const result = extractCPOListing(card)!;
    expect(result).not.toBeNull();
    expect(result.vin).toBe(vin);
    expect(result.year).toBe(2021);
    expect(result.model).toBe('ES 350');
    expect(result.trim).toBeNull();
    expect(result.mileage).toBe(30000);
    expect(result.price).toBe(42000);
    expect(result.dealer).toBe('Kuni Lexus of Portland');
  });
});

describe('extractAllCPOListings', () => {
  let cpoDoc: Document;

  beforeAll(() => {
    const html = readFileSync(
      resolve(__dirname, '../__fixtures__/lexus-cpo-results.html'),
      'utf-8',
    );
    // Use a fresh container to avoid polluting the new-inventory doc
    const container = document.createElement('div');
    container.innerHTML = html;
    cpoDoc = container as unknown as Document;
  });

  it('extracts the 3 valid cards', () => {
    const result = extractAllCPOListings(cpoDoc);
    expect(result.items.length).toBe(3);
  });

  it('reports error for card missing VIN', () => {
    const result = extractAllCPOListings(cpoDoc);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].index).toBe(3);
    expect(result.errors[0].message).toBe('Missing VIN or title');
  });

  it('extracts VINs in order', () => {
    const result = extractAllCPOListings(cpoDoc);
    const vins = result.items.map((l) => l.vin);
    expect(vins).toEqual(['JTJSARDZ4L2227037', '2T2BAMCA7PC034627', '2T2BCMEA1RC013413']);
  });

  it('extracts correct data for each card', () => {
    const result = extractAllCPOListings(cpoDoc);
    const [card1, card2, card3] = result.items;

    expect(card1.year).toBe(2020);
    expect(card1.model).toBe('NX 300');
    expect(card1.trim).toBe('F SPORT');
    expect(card1.mileage).toBe(49879);
    expect(card1.price).toBe(33528);
    expect(card1.dealer).toBe('Lexus of Portland');

    expect(card2.year).toBe(2023);
    expect(card2.model).toBe('RX 350');
    expect(card2.trim).toBe('F SPORT HANDLING AWD');
    expect(card2.mileage).toBe(10784);
    expect(card2.price).toBe(53407);

    expect(card3.year).toBe(2024);
    expect(card3.model).toBe('RX 500h');
    expect(card3.trim).toBe('F SPORT PERFORMANCE AWD');
    expect(card3.mileage).toBe(17675);
    expect(card3.price).toBe(65528);
    expect(card3.dealer).toBe('Kuni Lexus of Portland');
  });

  it('returns empty when no CPO tiles are present', () => {
    const container = document.createElement('div');
    container.innerHTML = '<div>no CPO tiles here</div>';
    const result = extractAllCPOListings(container);
    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});
