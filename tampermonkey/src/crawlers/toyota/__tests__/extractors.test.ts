import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  extractVin,
  extractListing,
  extractAllListings,
  matchesToyota,
  parseVehicleData,
  parseCPOVehicle,
} from '../extractors.js';

let doc: Document;

beforeAll(() => {
  const html = readFileSync(resolve(__dirname, '../__fixtures__/toyota-results.html'), 'utf-8');
  document.body.innerHTML = html;
  doc = document;
});

describe('extractVin', () => {
  it('extracts VIN from compare toggle aria-label (primary)', () => {
    const card = doc.querySelector('[data-testid="TileGrid"] > div')!;
    expect(extractVin(card)).toBe('4T1DAACK5TU18C972');
  });

  it('falls back to DGSaveHeart id when aria-label is missing', () => {
    const card = document.createElement('div');
    card.innerHTML =
      '<div data-testid="DGSaveHeart" id="dg-inline-saves-inv-4T1DAACK5TU18C972-vehicle-tile"></div>';
    expect(extractVin(card)).toBe('4T1DAACK5TU18C972');
  });

  it('returns null when neither source is present', () => {
    const card = document.createElement('div');
    card.innerHTML = '<span>no heart element</span>';
    expect(extractVin(card)).toBeNull();
  });

  it('returns null when DGSaveHeart id does not contain a VIN', () => {
    const card = document.createElement('div');
    card.innerHTML =
      '<div data-testid="DGSaveHeart" id="dg-inline-saves-inv-INVALID-vehicle-tile"></div>';
    expect(extractVin(card)).toBeNull();
  });

  it('extracts VIN from second card', () => {
    const cards = doc.querySelectorAll('[data-testid="TileGrid"] > div');
    expect(extractVin(cards[1])).toBe('4T1DAACK1TU22B456');
  });
});

describe('extractListing', () => {
  it('extracts SmartPath Camry LE card', () => {
    const card = doc.querySelectorAll('[data-testid="TileGrid"] > div')[0];
    const result = extractListing(card)!;
    expect(result).not.toBeNull();
    expect(result.vin).toBe('4T1DAACK5TU18C972');
    expect(result.title).toBe('Camry LE');
    expect(result.make).toBe('Toyota');
    expect(result.model).toBe('Camry');
    expect(result.trim).toBe('LE');
    expect(result.priceNumeric).toBe(30814);
    expect(result.dealerText).toBe('Toyota of Portland on Broadway (1 mi)');
    expect(result.tags).toBe('HybridFront-Wheel Drive');
    expect(result.isSmartPath).toBe(true);
    expect(result.matchStatus).toContain('Exact Match');
    expect(result.link).toContain('smartpath.toyota.com');
    expect(result.imageUrl).toContain('media.rti.toyota.com');
  });

  it('extracts non-SmartPath Camry SE card', () => {
    const card = doc.querySelectorAll('[data-testid="TileGrid"] > div')[1];
    const result = extractListing(card)!;
    expect(result).not.toBeNull();
    expect(result.vin).toBe('4T1DAACK1TU22B456');
    expect(result.title).toBe('Camry SE');
    expect(result.model).toBe('Camry');
    expect(result.trim).toBe('SE');
    expect(result.priceNumeric).toBe(32990);
    expect(result.dealerText).toBe('Beaverton Toyota (12 mi)');
    expect(result.isSmartPath).toBe(false);
    expect(result.matchStatus).toBe('Exact Match');
  });

  it('extracts build phase / in transit card', () => {
    const card = doc.querySelectorAll('[data-testid="TileGrid"] > div')[3];
    const result = extractListing(card)!;
    expect(result).not.toBeNull();
    expect(result.vin).toBe('2T3P1RFV8TW34D567');
    expect(result.title).toBe('RAV4 XLE');
    expect(result.model).toBe('RAV4');
    expect(result.trim).toBe('XLE');
    expect(result.buildPhase).toContain('build phase');
    expect(result.matchStatus).toBe('Similar Match');
  });

  it('returns null for card without DGSaveHeart', () => {
    const card = document.createElement('div');
    card.innerHTML = '<div data-testid="VehicleTileNameBase">Camry LE</div>';
    expect(extractListing(card)).toBeNull();
  });

  it('returns null for card without title', () => {
    const card = document.createElement('div');
    card.innerHTML =
      '<div data-testid="DGSaveHeart" id="dg-inline-saves-inv-4T1DAACK5TU18C972-vehicle-tile"></div>';
    expect(extractListing(card)).toBeNull();
  });
});

describe('extractAllListings', () => {
  it('extracts all 4 cards from the TileGrid', () => {
    const result = extractAllListings(doc);
    expect(result.items.length).toBe(4);
    expect(result.errors.length).toBe(0);
  });

  it('returns VINs in order', () => {
    const result = extractAllListings(doc);
    const vins = result.items.map((l) => l.vin);
    expect(vins).toEqual([
      '4T1DAACK5TU18C972',
      '4T1DAACK1TU22B456',
      'JTDBAMDE5TJ12A789',
      '2T3P1RFV8TW34D567',
    ]);
  });

  it('excludes cards outside TileGrid', () => {
    const result = extractAllListings(doc);
    const vins = result.items.map((l) => l.vin);
    // Prius outside TileGrid should not appear
    expect(vins).not.toContain('JTDKN3DU5A0123456');
  });

  it('returns empty when TileGrid is missing', () => {
    const empty = document.createElement('div');
    empty.innerHTML = '<div>no tile grid here</div>';
    const result = extractAllListings(empty);
    expect(result.items.length).toBe(0);
    expect(result.errors.length).toBe(0);
  });

  it('reports errors for cards with missing data', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div data-testid="TileGrid">
        <div><span>empty card</span></div>
      </div>
    `;
    const result = extractAllListings(container);
    expect(result.items.length).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toBe('Missing VIN or title');
  });
});

describe('matchesToyota', () => {
  it('matches search-inventory URLs', () => {
    expect(
      matchesToyota(
        'https://www.toyota.com/search-inventory/model/camry/?zipcode=97201&distance=50',
      ),
    ).toBe(true);
    expect(matchesToyota('https://www.toyota.com/search-inventory/model/rav4')).toBe(true);
    expect(matchesToyota('https://toyota.com/search-inventory')).toBe(true);
  });

  it('does not match non-inventory pages', () => {
    expect(matchesToyota('https://www.toyota.com/')).toBe(false);
    expect(matchesToyota('https://www.toyota.com/camry')).toBe(false);
    expect(matchesToyota('https://www.google.com/search-inventory')).toBe(false);
  });

  it('matches toyotacertified.com/inventory URLs', () => {
    expect(matchesToyota('https://www.toyotacertified.com/inventory?zipCode=97201&radius=25')).toBe(
      true,
    );
    expect(matchesToyota('https://toyotacertified.com/inventory')).toBe(true);
  });

  it('does not match toyotacertified.com non-inventory pages', () => {
    expect(matchesToyota('https://www.toyotacertified.com/')).toBe(false);
    expect(matchesToyota('https://www.toyotacertified.com/about')).toBe(false);
    expect(matchesToyota('https://toyotacertified.com/search-inventory')).toBe(false);
  });
});

// Factory: build a vehicle data object with overridable fields for parseVehicleData tests
function makeVehicleData(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    vin: '4T1DAACK5TU18C972',
    name: '2026 Camry LE',
    marketingSeries: 'Camry',
    year: '2026',
    model: 'Camry',
    trim: { value: 'Camry LE', code: '2559-2026' },
    stockNum: null,
    mileage: 0,
    description: '2.5L 4-Cyl. Gas/Electric Hybrid, Electronically controlled CVT',
    isElectric: false,
    isPreSold: false,
    isSmartPath: true,
    engine: { value: '2.5L 4-Cyl. Gas/Electric Hybrid', code: '24CGH' },
    fuelType: { code: 'B', value: 'Hybrid' },
    drivetrain: { value: 'Front-Wheel Drive', code: 'FWD' },
    baseMsrp: 29300,
    msrp: 30814,
    price: 30814,
    priceData: {
      advertizedPrice: 30814,
      nonSpAdvertizedPrice: null,
      totalMsrp: 30814,
      sellingPrice: 30814,
      dph: null,
      dioTotalMsrp: 0,
      dioTotalDealerSellingPrice: 0,
      dealerCashApplied: null,
      baseMsrp: 29300,
    },
    dealer: {
      value: 'Toyota of Portland on Broadway (1 mi)',
      code: '36097',
      name: 'Toyota of Portland on Broadway',
      distance: 1,
      isPMA: true,
      isSmartPath: true,
      dealerSiteURL: 'https://www.toyotaofportland.com',
    },
    extColor: {
      value: 'Reservoir Blue',
      label: 'Reservoir Blue',
      hex: '1A1C37',
      code: '08Q4',
      colorFamilies: ['Blue'],
    },
    intColor: { value: 'Black Fabric', label: 'Black Fabric', code: 'FA20' },
    jelly: {
      image: {
        desktop: {
          src: 'https://media.rti.toyota.com/adobe/assets/camry-le.png?size=315,215',
        },
      },
    },
    estMpg: '52/49 est. mpg',
    modelData: {
      modelCd: '2559',
      marketingName: 'Camry LE',
      marketingTitle: 'Camry LE 2.5L 4-Cyl. Engine Front-Wheel Drive',
    },
    category: ['Electrified', 'cars', 'Cars & Minivan'],
    inventoryStatus: 'Vehicle is in build phase. Estimated availability 05/22/26 - 06/12/26.',
    href: 'https://smartpath.toyota.com/inventory/details?source=t1&dealerCd=36097&vin=4T1DAACK5TU18C972&type=new',
    vdpUrl: 'https://smartpath.toyotaofportland.com/inventory/details?vin=4T1DAACK5TU18C972',
    options: [],
    availability: [
      { name: 'Show Sale Pending', code: 'salePending', valueToggle: false },
      { name: 'Show In Transit', code: 'inTransit', valueToggle: true },
    ],
    ...overrides,
  };
}

describe('parseVehicleData', () => {
  it('parses a full vehicle object', () => {
    const result = parseVehicleData(makeVehicleData())!;
    expect(result).not.toBeNull();
    expect(result.vin).toBe('4T1DAACK5TU18C972');
    expect(result.name).toBe('2026 Camry LE');
    expect(result.marketingSeries).toBe('Camry');
    expect(result.year).toBe('2026');
    expect(result.model).toBe('Camry');
    expect(result.trim).toBe('Camry LE');
    expect(result.trimCode).toBe('2559-2026');
    expect(result.mileage).toBe(0);
    expect(result.isElectric).toBe(false);
    expect(result.isSmartPath).toBe(true);
    expect(result.engine).toBe('2.5L 4-Cyl. Gas/Electric Hybrid');
    expect(result.fuelType).toBe('Hybrid');
    expect(result.drivetrain).toBe('Front-Wheel Drive');
    expect(result.baseMsrp).toBe(29300);
    expect(result.msrp).toBe(30814);
    expect(result.price).toBe(30814);
    expect(result.estMpg).toBe('52/49 est. mpg');
    expect(result.inventoryStatus).toContain('build phase');
    expect(result.category).toEqual(['Electrified', 'cars', 'Cars & Minivan']);
  });

  it('parses price data', () => {
    const result = parseVehicleData(makeVehicleData())!;
    expect(result.priceData).not.toBeNull();
    expect(result.priceData!.advertizedPrice).toBe(30814);
    expect(result.priceData!.totalMsrp).toBe(30814);
    expect(result.priceData!.baseMsrp).toBe(29300);
    expect(result.priceData!.nonSpAdvertizedPrice).toBeNull();
  });

  it('parses dealer data', () => {
    const result = parseVehicleData(makeVehicleData())!;
    expect(result.dealer).not.toBeNull();
    expect(result.dealer!.name).toBe('Toyota of Portland on Broadway');
    expect(result.dealer!.code).toBe('36097');
    expect(result.dealer!.distance).toBe(1);
    expect(result.dealer!.isSmartPath).toBe(true);
    expect(result.dealer!.dealerSiteURL).toBe('https://www.toyotaofportland.com');
  });

  it('parses exterior and interior colors', () => {
    const result = parseVehicleData(makeVehicleData())!;
    expect(result.extColor).not.toBeNull();
    expect(result.extColor!.value).toBe('Reservoir Blue');
    expect(result.extColor!.hex).toBe('1A1C37');
    expect(result.extColor!.colorFamilies).toEqual(['Blue']);
    expect(result.intColor).not.toBeNull();
    expect(result.intColor!.value).toBe('Black Fabric');
    expect(result.intColor!.code).toBe('FA20');
  });

  it('parses image URL from jelly data', () => {
    const result = parseVehicleData(makeVehicleData())!;
    expect(result.imageUrl).toBe(
      'https://media.rti.toyota.com/adobe/assets/camry-le.png?size=315,215',
    );
  });

  it('parses SmartPath href', () => {
    const result = parseVehicleData(makeVehicleData())!;
    expect(result.href).toContain('smartpath.toyota.com');
    expect(result.vdpUrl).toContain('smartpath.toyotaofportland.com');
  });

  it('handles non-SmartPath vehicle (href: false)', () => {
    const result = parseVehicleData(
      makeVehicleData({
        isSmartPath: false,
        href: false,
        dealer: {
          code: '36200',
          name: 'Beaverton Toyota',
          distance: 12,
          isPMA: false,
          isSmartPath: false,
          dealerSiteURL: 'https://www.beavertontoyota.com',
        },
        priceData: {
          advertizedPrice: null,
          nonSpAdvertizedPrice: 32990,
          totalMsrp: 32990,
          sellingPrice: 32990,
          dph: null,
          dioTotalMsrp: 0,
          dioTotalDealerSellingPrice: 0,
          dealerCashApplied: null,
          baseMsrp: 29300,
        },
      }),
    )!;
    expect(result.isSmartPath).toBe(false);
    expect(result.href).toBeNull(); // false is not a string
    expect(result.dealer!.isSmartPath).toBe(false);
    expect(result.priceData!.nonSpAdvertizedPrice).toBe(32990);
    expect(result.priceData!.advertizedPrice).toBeNull();
  });

  it('handles missing optional fields gracefully', () => {
    const result = parseVehicleData(
      makeVehicleData({
        name: undefined,
        stockNum: undefined,
        description: undefined,
        priceData: undefined,
        dealer: undefined,
        extColor: undefined,
        intColor: undefined,
        jelly: undefined,
        estMpg: undefined,
        inventoryStatus: undefined,
        href: undefined,
        vdpUrl: undefined,
        options: undefined,
        category: undefined,
      }),
    )!;
    expect(result.name).toBeNull();
    expect(result.priceData).toBeNull();
    expect(result.dealer).toBeNull();
    expect(result.extColor).toBeNull();
    expect(result.intColor).toBeNull();
    expect(result.imageUrl).toBeNull();
    expect(result.estMpg).toBeNull();
    expect(result.inventoryStatus).toBeNull();
    expect(result.href).toBeNull();
    expect(result.vdpUrl).toBeNull();
    expect(result.options).toEqual([]);
    expect(result.category).toEqual([]);
  });

  it('returns null for null input', () => {
    expect(parseVehicleData(null)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(parseVehicleData('string')).toBeNull();
    expect(parseVehicleData(42)).toBeNull();
  });

  it('returns null when VIN is missing', () => {
    expect(parseVehicleData(makeVehicleData({ vin: undefined }))).toBeNull();
  });

  it('returns null when VIN is invalid', () => {
    expect(parseVehicleData(makeVehicleData({ vin: 'INVALID' }))).toBeNull();
    expect(parseVehicleData(makeVehicleData({ vin: '12345' }))).toBeNull();
  });

  it('falls back to modelData.marketingName when trim.value is missing', () => {
    const result = parseVehicleData(makeVehicleData({ trim: undefined }))!;
    expect(result.trim).toBe('Camry LE');
    expect(result.trimCode).toBeNull();
  });
});

// Factory: build a CPO vehicle data object with overridable fields for parseCPOVehicle tests
function makeCPOVehicle(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    vin: '2T3MWRFV2RW245706',
    stockNumber: 'T14200',
    seriesCode: 'rav4hybrid',
    year: 2024,
    marketingSeries: 'RAV4 HYBRID',
    mileage: '38742',
    certificationType: 'GOLD',
    certificationStatus: 'CERTIFIED',
    type: 'SUV',
    bodyStyle: 'SUV',
    brand: 'TOYOTA',
    grade: 'LE',
    acquiredDate: '2026-03-21',
    isPreviousRental: false,
    dealerCd: '36097',
    dealerCategory: 'H',
    owningDealerName: 'Toyota of Portland on Broadway',
    vehicleComments: 'Drive smarter with the 2024 Toyota RAV4 Hybrid LE...',
    grossWeightRating: '4920',
    model: {
      modelDescription: 'RAV4 Hybrid',
      modelName: 'RAV4 HYBRID',
      modelNumber: '4435',
      modelYear: '2024',
      marketingTitle: 'RAV4 Hybrid LE 2.5L 4-Cyl. Engine All-Wheel Drive',
      marketingName: 'RAV4 HYBRID LE AWD SUV',
    },
    engine: {
      horsePower: 219,
      marketingFuelType: 'Hybrid',
      fuelType: 'H',
      name: '4 Cylinder Engine',
      noOfCylinders: '4',
    },
    transmission: {
      transmissionDescription: 'Continuously Variable Transmission',
      transmissionType: 'A',
      transmissionCode: 'CVT-E',
    },
    drivetrain: { code: 'AWD', title: 'All-Wheel Drive' },
    price: {
      sellingPrice: 33994,
      baseMsrp: 31725,
      totalMsrp: 34109,
      advertizedPrice: 33994,
    },
    extColor: {
      hexCode: '#FFFFFF',
      colorCd: '0040',
      marketingName: 'ICE CAP',
    },
    intColor: {
      colorCd: 'FB20',
      marketingName: 'BLACK',
    },
    mpg: { city: 41, combined: 39, highway: 38 },
    mpge: { city: null, combined: null, highway: null },
    media: [
      {
        href: 'https://cdnrs.inventoryrsc.com/640x480/img1.jpg',
        type: 'exterior',
        visible: true,
      },
      {
        href: 'https://cdnrs.inventoryrsc.com/640x480/img2.jpg',
        type: 'interior',
        visible: true,
      },
      {
        href: 'https://cdnrs.inventoryrsc.com/640x480/hidden.jpg',
        type: 'exterior',
        visible: false,
      },
    ],
    options: [
      { optionCd: 'BD', marketingName: 'Blind Spot Monitor', packageInd: false },
      { optionCd: 'CF', marketingName: 'Cargo Liner', packageInd: false },
    ],
    carFaxReport: {
      ownerHistory: { oneOwner: true, displayText: 'CARFAX 1-Owner' },
      accident: { hasAccidents: false, iconText: 'No Accident or Damage Reported' },
      useType: { isPersonalUse: false, iconText: 'Rental Use' },
    },
    eta: { currFromDate: '2024-10-16', currToDate: '2024-10-18' },
    ...overrides,
  };
}

describe('parseCPOVehicle', () => {
  it('parses a full CPO vehicle object', () => {
    const result = parseCPOVehicle(makeCPOVehicle())!;
    expect(result).not.toBeNull();
    expect(result.vin).toBe('2T3MWRFV2RW245706');
    expect(result.stockNumber).toBe('T14200');
    expect(result.year).toBe(2024);
    expect(result.marketingSeries).toBe('RAV4 HYBRID');
    expect(result.model).toBe('RAV4 Hybrid');
    expect(result.modelName).toBe('RAV4 HYBRID');
    expect(result.modelYear).toBe('2024');
    expect(result.marketingTitle).toBe('RAV4 Hybrid LE 2.5L 4-Cyl. Engine All-Wheel Drive');
    expect(result.grade).toBe('LE');
    expect(result.mileage).toBe(38742);
    expect(result.certificationType).toBe('GOLD');
    expect(result.certificationStatus).toBe('CERTIFIED');
    expect(result.bodyStyle).toBe('SUV');
    expect(result.brand).toBe('TOYOTA');
    expect(result.isPreviousRental).toBe(false);
    expect(result.dealerCode).toBe('36097');
    expect(result.dealerName).toBe('Toyota of Portland on Broadway');
    expect(result.vehicleComments).toContain('RAV4 Hybrid LE');
  });

  it('parses engine data', () => {
    const result = parseCPOVehicle(makeCPOVehicle())!;
    expect(result.engineName).toBe('4 Cylinder Engine');
    expect(result.horsePower).toBe(219);
    expect(result.fuelType).toBe('Hybrid');
    expect(result.cylinders).toBe('4');
  });

  it('parses transmission and drivetrain', () => {
    const result = parseCPOVehicle(makeCPOVehicle())!;
    expect(result.transmission).toBe('Continuously Variable Transmission');
    expect(result.drivetrain).toBe('All-Wheel Drive');
    expect(result.drivetrainCode).toBe('AWD');
  });

  it('parses pricing data', () => {
    const result = parseCPOVehicle(makeCPOVehicle())!;
    expect(result.sellingPrice).toBe(33994);
    expect(result.baseMsrp).toBe(31725);
    expect(result.totalMsrp).toBe(34109);
    expect(result.advertizedPrice).toBe(33994);
  });

  it('parses color data', () => {
    const result = parseCPOVehicle(makeCPOVehicle())!;
    expect(result.extColorName).toBe('ICE CAP');
    expect(result.extColorHex).toBe('#FFFFFF');
    expect(result.intColorName).toBe('BLACK');
  });

  it('parses MPG data', () => {
    const result = parseCPOVehicle(makeCPOVehicle())!;
    expect(result.mpgCity).toBe(41);
    expect(result.mpgHighway).toBe(38);
    expect(result.mpgCombined).toBe(39);
  });

  it('parses media URLs and filters out non-visible', () => {
    const result = parseCPOVehicle(makeCPOVehicle())!;
    expect(result.imageUrls).toEqual([
      'https://cdnrs.inventoryrsc.com/640x480/img1.jpg',
      'https://cdnrs.inventoryrsc.com/640x480/img2.jpg',
    ]);
  });

  it('parses options as marketing names', () => {
    const result = parseCPOVehicle(makeCPOVehicle())!;
    expect(result.options).toEqual(['Blind Spot Monitor', 'Cargo Liner']);
  });

  it('parses CarFax report fields', () => {
    const result = parseCPOVehicle(makeCPOVehicle())!;
    expect(result.carfaxOneOwner).toBe(true);
    expect(result.carfaxNoAccidents).toBe(true);
    expect(result.carfaxPersonalUse).toBe(false);
  });

  it('handles missing optional fields gracefully', () => {
    const result = parseCPOVehicle(
      makeCPOVehicle({
        stockNumber: undefined,
        marketingSeries: undefined,
        model: undefined,
        grade: undefined,
        mileage: undefined,
        certificationType: undefined,
        certificationStatus: undefined,
        bodyStyle: undefined,
        vehicleComments: undefined,
        engine: undefined,
        transmission: undefined,
        drivetrain: undefined,
        price: undefined,
        extColor: undefined,
        intColor: undefined,
        mpg: undefined,
        media: undefined,
        options: undefined,
        carFaxReport: undefined,
      }),
    )!;
    expect(result).not.toBeNull();
    expect(result.vin).toBe('2T3MWRFV2RW245706');
    expect(result.stockNumber).toBeNull();
    expect(result.marketingSeries).toBeNull();
    expect(result.model).toBeNull();
    expect(result.grade).toBeNull();
    expect(result.mileage).toBeNull();
    expect(result.engineName).toBeNull();
    expect(result.horsePower).toBeNull();
    expect(result.transmission).toBeNull();
    expect(result.drivetrain).toBeNull();
    expect(result.sellingPrice).toBeNull();
    expect(result.extColorName).toBeNull();
    expect(result.intColorName).toBeNull();
    expect(result.mpgCity).toBeNull();
    expect(result.imageUrls).toEqual([]);
    expect(result.options).toEqual([]);
    expect(result.carfaxOneOwner).toBe(false);
    expect(result.carfaxNoAccidents).toBe(false);
    expect(result.carfaxPersonalUse).toBe(false);
  });

  it('returns null for null input', () => {
    expect(parseCPOVehicle(null)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(parseCPOVehicle('string')).toBeNull();
    expect(parseCPOVehicle(42)).toBeNull();
  });

  it('returns null when VIN is missing', () => {
    expect(parseCPOVehicle(makeCPOVehicle({ vin: undefined }))).toBeNull();
  });

  it('returns null when VIN is invalid', () => {
    expect(parseCPOVehicle(makeCPOVehicle({ vin: 'INVALID' }))).toBeNull();
    expect(parseCPOVehicle(makeCPOVehicle({ vin: '12345' }))).toBeNull();
  });

  it('returns null when year is missing', () => {
    expect(parseCPOVehicle(makeCPOVehicle({ year: undefined }))).toBeNull();
  });

  it('returns null when year is not a number', () => {
    expect(parseCPOVehicle(makeCPOVehicle({ year: '2024' }))).toBeNull();
  });

  it('parses mileage from string to number', () => {
    const result = parseCPOVehicle(makeCPOVehicle({ mileage: '12345' }))!;
    expect(result.mileage).toBe(12345);
  });

  it('returns null mileage for non-numeric string', () => {
    const result = parseCPOVehicle(makeCPOVehicle({ mileage: 'unknown' }))!;
    expect(result.mileage).toBeNull();
  });

  it('defaults brand to TOYOTA when missing', () => {
    const result = parseCPOVehicle(makeCPOVehicle({ brand: undefined }))!;
    expect(result.brand).toBe('TOYOTA');
  });

  it('handles accident report with hasAccidents=true', () => {
    const result = parseCPOVehicle(
      makeCPOVehicle({
        carFaxReport: {
          ownerHistory: { oneOwner: false },
          accident: { hasAccidents: true },
          useType: { isPersonalUse: true },
        },
      }),
    )!;
    expect(result.carfaxOneOwner).toBe(false);
    expect(result.carfaxNoAccidents).toBe(false);
    expect(result.carfaxPersonalUse).toBe(true);
  });

  it('handles media with empty href', () => {
    const result = parseCPOVehicle(
      makeCPOVehicle({
        media: [{ href: '', type: 'exterior', visible: true }],
      }),
    )!;
    expect(result.imageUrls).toEqual([]);
  });
});
