import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  extractListing,
  extractAllListings,
  matchesAutoTrader,
  parseTitle,
  parsePrice,
  extractVinFromHtml,
  parseDetailPageHtml,
  parseVehicleInventory,
} from '../extractors.js';

let doc: Document;

beforeAll(() => {
  const html = readFileSync(resolve(__dirname, '../__fixtures__/autotrader-results.html'), 'utf-8');
  document.body.innerHTML = html;
  doc = document;
});

describe('parseTitle', () => {
  it('parses year, make, and model', () => {
    const result = parseTitle('2025 Rivian R1S');
    expect(result.year).toBe(2025);
    expect(result.make).toBe('Rivian');
    expect(result.model).toBe('R1S');
  });

  it('handles hyphenated make names', () => {
    const result = parseTitle('2025 Mercedes-Benz GLC 300');
    expect(result.make).toBe('Mercedes-Benz');
    expect(result.model).toBe('GLC 300');
  });

  it('handles multi-word model names', () => {
    const result = parseTitle('2025 Toyota Land Cruiser');
    expect(result.make).toBe('Toyota');
    expect(result.model).toBe('Land Cruiser');
  });

  it('returns nulls for unparseable title', () => {
    const result = parseTitle('No Year Here');
    expect(result).toEqual({ year: null, make: null, model: null });
  });
});

describe('parsePrice', () => {
  it('extracts numeric price from formatted string', () => {
    expect(parsePrice('77,990')).toBe(77990);
  });

  it('handles price with dollar sign', () => {
    expect(parsePrice('$52,345')).toBe(52345);
  });

  it('returns null for null input', () => {
    expect(parsePrice(null)).toBeNull();
  });

  it('returns null for non-numeric text', () => {
    expect(parsePrice('Contact Dealer')).toBeNull();
  });
});

describe('extractListing', () => {
  it('extracts all fields from a newly listed card', () => {
    const card = doc.querySelector('[data-qaid="cntnr-listing-776711560"]')!;
    const result = extractListing(card)!;
    expect(result.listingId).toBe('776711560');
    expect(result.title).toBe('2025 Rivian R1S');
    expect(result.year).toBe(2025);
    expect(result.make).toBe('Rivian');
    expect(result.model).toBe('R1S');
    expect(result.trim).toBe('Adventure');
    expect(result.price).toBe(71900);
    expect(result.mileage).toBe('6K mi');
    expect(result.link).toContain('/cars-for-sale/vehicle/776711560');
    expect(result.imageUrl).toContain('b3a60982c6654b1385c1066847c9d03f.jpg');
    expect(result.condition).toBe('Used');
    expect(result.fuelType).toBe('Electric');
    expect(result.dealerName).toBe('Maserati Tampa');
    expect(result.dealerDistance).toBe('2496.48 mi. away');
    expect(result.isPriceDrop).toBe(false);
    expect(result.isNewlyListed).toBe(true);
    expect(result.vhrBadge).toBe('No Accidents');
  });

  it('detects Price Drop badge', () => {
    const card = doc.querySelector('[data-qaid="cntnr-listing-773906951"]')!;
    const result = extractListing(card)!;
    expect(result.listingId).toBe('773906951');
    expect(result.title).toBe('2026 Rivian R1S');
    expect(result.isPriceDrop).toBe(true);
    expect(result.isNewlyListed).toBe(false);
    expect(result.price).toBe(77990);
    expect(result.dealerName).toBe('D&C Motor Company');
    expect(result.vhrBadge).toBeNull();
  });

  it('extracts normal listing without badges', () => {
    const card = doc.querySelector('[data-qaid="cntnr-listing-772846828"]')!;
    const result = extractListing(card)!;
    expect(result.listingId).toBe('772846828');
    expect(result.title).toBe('2022 Rivian R1S');
    expect(result.trim).toBe('Launch Edition');
    expect(result.mileage).toBe('36K mi');
    expect(result.price).toBe(59000);
    expect(result.isPriceDrop).toBe(false);
    expect(result.isNewlyListed).toBe(false);
    expect(result.vhrBadge).toBe('No Accidents');
  });

  it('handles multi-word make (Mercedes-Benz)', () => {
    const card = doc.querySelector('[data-qaid="cntnr-listing-775024029"]')!;
    const result = extractListing(card)!;
    expect(result.make).toBe('Mercedes-Benz');
    expect(result.model).toBe('GLC 300');
    expect(result.trim).toBe('4MATIC');
    expect(result.condition).toBe('New');
    expect(result.fuelType).toBe('Gasoline');
    expect(result.price).toBe(52345);
  });

  it('detects both Price Drop and Newly Listed', () => {
    const card = doc.querySelector('[data-qaid="cntnr-listing-768977930"]')!;
    const result = extractListing(card)!;
    expect(result.isPriceDrop).toBe(true);
    expect(result.isNewlyListed).toBe(true);
    expect(result.price).toBe(58974);
    expect(result.dealerName).toBe('CarMax');
  });

  it('returns null for card without id', () => {
    const card = document.createElement('div');
    card.setAttribute('data-cmp', 'inventoryListing');
    card.innerHTML = '<h2 data-cmp="subheading">2025 Rivian R1S</h2>';
    expect(extractListing(card)).toBeNull();
  });
});

describe('extractAllListings', () => {
  it('extracts only the 5 real listings, not the sponsored or supplemental', () => {
    const result = extractAllListings(doc);
    expect(result.items.length).toBe(5);
    expect(result.errors.length).toBe(0);
  });

  it('excludes sponsored cards (no data-qaid) and supplemental cards outside container', () => {
    const result = extractAllListings(doc);
    const ids = result.items.map((l) => l.listingId);
    expect(ids).toEqual(['776711560', '773906951', '772846828', '775024029', '768977930']);
    // Sponsored card with no id/qaid should not appear
    // Supplemental card 888888888 outside container should not appear
    expect(ids).not.toContain('888888888');
    expect(ids).not.toContain('999999999');
  });

  it('reports errors for cards with missing data', () => {
    const container = document.createElement('div');
    container.setAttribute('data-cmp', 'cntnr-listings');
    container.innerHTML =
      '<div data-cmp="inventoryListing" data-qaid="cntnr-listing-x"><div>empty card</div></div>';
    const result = extractAllListings(container);
    expect(result.items.length).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toBe('Missing listing ID or title');
  });
});

describe('matchesAutoTrader', () => {
  it('matches search results URLs', () => {
    expect(matchesAutoTrader('https://www.autotrader.com/cars-for-sale/all-cars/rivian/r1s')).toBe(
      true,
    );
    expect(
      matchesAutoTrader(
        'https://www.autotrader.com/cars-for-sale/all-cars/rivian/r1s?startYear=2025&zip=97201',
      ),
    ).toBe(true);
    expect(matchesAutoTrader('https://www.autotrader.com/cars-for-sale/used-cars/rivian/r1s')).toBe(
      true,
    );
    expect(
      matchesAutoTrader('https://www.autotrader.com/cars-for-sale/all-cars/rivian/r1s/portland-or'),
    ).toBe(true);
  });

  it('does not match detail pages or other pages', () => {
    expect(matchesAutoTrader('https://www.autotrader.com/cars-for-sale/vehicle/773906951')).toBe(
      false,
    );
    expect(matchesAutoTrader('https://www.autotrader.com/')).toBe(false);
    expect(matchesAutoTrader('https://www.autotrader.com/sell-my-car')).toBe(false);
    expect(matchesAutoTrader('https://www.google.com')).toBe(false);
  });
});

describe('extractVinFromHtml', () => {
  it('extracts VIN from __NEXT_DATA__', () => {
    const html = makeDetailHtml({ vin: '7PDSGGBA5TN078065' });
    expect(extractVinFromHtml(html)).toBe('7PDSGGBA5TN078065');
  });

  it('falls back to regex when __NEXT_DATA__ missing', () => {
    const html = '<div>"vin":"5YJ3E1EA1PF123456"</div>';
    expect(extractVinFromHtml(html)).toBe('5YJ3E1EA1PF123456');
  });

  it('returns null when VIN not found', () => {
    expect(extractVinFromHtml('<div>no vin here</div>')).toBeNull();
  });
});

// Factory: build a detail page HTML with __NEXT_DATA__ containing the given inventory fields
function makeDetailHtml(vehicleOverrides: Record<string, any> = {}) {
  const vehicle = {
    id: 773906951,
    vin: '7PDSGGBA5TN078065',
    stockId: 'TR078065',
    year: 2026,
    make: { code: 'RIVIAN', name: 'Rivian' },
    model: { code: 'RIVIANR1S', name: 'R1S' },
    trim: { code: 'RIVIANR1S|Adventure', name: 'Adventure' },
    title: 'Used 2026 Rivian R1S Adventure',
    listingType: 'USED',
    mileage: { label: 'Mileage', value: '1,200' },
    pricingDetail: { salePrice: 77990 },
    bodyStyles: [{ code: 'SUV', name: 'Sport Utility' }],
    color: { exteriorColor: 'La Silver', exteriorColorSimple: 'SILVER', interiorColor: 'Black' },
    driveType: { description: 'All wheel drive', name: 'AWD4WD' },
    engine: { code: 'EL', name: 'Electric' },
    fuelType: { code: 'E', group: 'Electric', name: 'Electric' },
    transmission: { code: 'AUT', description: 'Single-Speed', name: 'Automatic' },
    doors: '4',
    electricVehicleRange: 258,
    electricComponentInfo: {
      batteryRange: 258,
      batteryType: 'Lithium-Ion',
      batteryCapacity: 0,
      batteryEnergyCapacity: 235,
      batteryEfficiencyCity: 40,
      batteryEfficiencyHighway: 47,
      batteryEfficiencyCombined: 43,
      batteryMaximumChargeRate: 220,
      chargingLevelMax: 'DC Level 2',
      chargingPortSide: 'Driver',
      connectorTypes: 'NACS',
      electricMotorCount: 2,
      epaChargeTimeAt240V: 9.5,
    },
    isReducedPrice: true,
    isNewlyListed: false,
    isHot: false,
    daysOnSite: 34,
    ownerName: 'D&C Motor Company',
    vhrPreview: ['NO_SALVAGE_TITLE', 'NO_ACCIDENTS_REPORTED'],
    pricingHistory: [
      { dateUpdated: '03.04.2026', price: '$84,990' },
      { dateUpdated: 'Price Today', price: '$77,990' },
    ],
    specifications: {
      mileRange: { label: 'Mile Range', value: '258 EV Mile Range' },
      transmission: { label: 'Transmission', value: 'Single-Speed' },
      color: { label: 'Exterior Color', value: 'Silver' },
      fuelType: { label: 'Fuel Type', value: 'Electric' },
      engine: { label: 'Engine', value: 'Electric' },
      driveType: { label: 'Drive Type', value: 'All Wheel Drive' },
    },
    images: {
      primary: 0,
      sources: [
        {
          alt: 'Used 2026 Rivian R1S Adventure',
          src: 'https://images.autotrader.com/hn/c/31e1e47ecf1d4395a67150d5c1c9b598.jpg',
          width: 4032,
          height: 3024,
        },
        {
          alt: 'Used 2026 Rivian R1S Adventure',
          src: 'https://images.autotrader.com/hn/c/6b86f519c2184b20b80f46d0e270a681.jpg',
          width: 4032,
          height: 3024,
        },
        {
          alt: 'Used 2026 Rivian R1S Adventure',
          src: 'https://images.autotrader.com/hn/c/2cd4c011c5fe4666bb0d3a16c0a328ab.jpg',
          width: 4032,
          height: 3024,
        },
      ],
    },
    ...vehicleOverrides,
  };

  return `<html><head></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    {
      props: {
        pageProps: {
          __eggsState: {
            inventory: { [vehicle.id]: vehicle },
          },
        },
      },
    },
  )}</script></body></html>`;
}

describe('parseDetailPageHtml', () => {
  it('extracts full vehicle details from detail page', () => {
    const html = makeDetailHtml();
    const details = parseDetailPageHtml(html)!;
    expect(details).not.toBeNull();
    expect(details.listingId).toBe(773906951);
    expect(details.vin).toBe('7PDSGGBA5TN078065');
    expect(details.stockId).toBe('TR078065');
    expect(details.year).toBe(2026);
    expect(details.make).toBe('Rivian');
    expect(details.model).toBe('R1S');
    expect(details.trim).toBe('Adventure');
    expect(details.title).toBe('Used 2026 Rivian R1S Adventure');
    expect(details.listingType).toBe('USED');
    expect(details.price).toBe(77990);
    expect(details.mileage).toBe('1,200');
    expect(details.bodyStyle).toBe('Sport Utility');
    expect(details.exteriorColor).toBe('La Silver');
    expect(details.exteriorColorSimple).toBe('SILVER');
    expect(details.interiorColor).toBe('Black');
    expect(details.driveType).toBe('All wheel drive');
    expect(details.engine).toBe('Electric');
    expect(details.fuelType).toBe('Electric');
    expect(details.transmission).toBe('Single-Speed');
    expect(details.doors).toBe('4');
    expect(details.isReducedPrice).toBe(true);
    expect(details.isNewlyListed).toBe(false);
    expect(details.daysOnSite).toBe(34);
    expect(details.ownerName).toBe('D&C Motor Company');
  });

  it('extracts EV-specific fields', () => {
    const html = makeDetailHtml();
    const details = parseDetailPageHtml(html)!;
    expect(details.electricVehicleRange).toBe(258);
    expect(details.electricInfo).not.toBeNull();
    expect(details.electricInfo!.batteryRange).toBe(258);
    expect(details.electricInfo!.batteryType).toBe('Lithium-Ion');
    expect(details.electricInfo!.batteryEnergyCapacity).toBe(235);
    expect(details.electricInfo!.batteryEfficiencyCity).toBe(40);
    expect(details.electricInfo!.batteryEfficiencyHighway).toBe(47);
    expect(details.electricInfo!.batteryMaximumChargeRate).toBe(220);
    expect(details.electricInfo!.chargingLevelMax).toBe('DC Level 2');
    expect(details.electricInfo!.connectorTypes).toBe('NACS');
    expect(details.electricInfo!.electricMotorCount).toBe(2);
    expect(details.electricInfo!.epaChargeTimeAt240V).toBe(9.5);
  });

  it('extracts specs from specifications object', () => {
    const html = makeDetailHtml();
    const details = parseDetailPageHtml(html)!;
    expect(details.specs).toContainEqual({ label: 'Mile Range', value: '258 EV Mile Range' });
    expect(details.specs).toContainEqual({ label: 'Transmission', value: 'Single-Speed' });
    expect(details.specs).toContainEqual({ label: 'Fuel Type', value: 'Electric' });
    expect(details.specs).toContainEqual({ label: 'Drive Type', value: 'All Wheel Drive' });
  });

  it('adds supplementary specs from structured fields', () => {
    const html = makeDetailHtml();
    const details = parseDetailPageHtml(html)!;
    // Body Style is not in specifications, so it should be added from bodyStyles
    expect(details.specs).toContainEqual({ label: 'Body Style', value: 'Sport Utility' });
    expect(details.specs).toContainEqual({ label: 'Doors', value: '4' });
  });

  it('builds image manifest from sources array', () => {
    const html = makeDetailHtml();
    const details = parseDetailPageHtml(html)!;
    expect(details.imageManifest).toHaveLength(3);
    expect(details.imageManifest[0]).toEqual({
      name: 'Used 2026 Rivian R1S Adventure',
      src: 'https://images.autotrader.com/hn/c/31e1e47ecf1d4395a67150d5c1c9b598.jpg',
      width: 4032,
      height: 3024,
    });
  });

  it('extracts pricing history', () => {
    const html = makeDetailHtml();
    const details = parseDetailPageHtml(html)!;
    expect(details.pricingHistory).toHaveLength(2);
    expect(details.pricingHistory[0]).toEqual({
      dateUpdated: '03.04.2026',
      price: '$84,990',
    });
  });

  it('extracts vehicle history report preview', () => {
    const html = makeDetailHtml();
    const details = parseDetailPageHtml(html)!;
    expect(details.vhrPreview).toEqual(['NO_SALVAGE_TITLE', 'NO_ACCIDENTS_REPORTED']);
  });

  it('returns null when __NEXT_DATA__ is missing', () => {
    expect(parseDetailPageHtml('<html><body>no data</body></html>')).toBeNull();
  });

  it('returns null when __NEXT_DATA__ contains invalid JSON', () => {
    const html = '<script id="__NEXT_DATA__" type="application/json">{not valid json</script>';
    expect(parseDetailPageHtml(html)).toBeNull();
  });

  it('returns null when inventory is missing', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"__eggsState":{}}}}</script>`;
    expect(parseDetailPageHtml(html)).toBeNull();
  });
});

describe('parseVehicleInventory', () => {
  it('handles missing optional fields gracefully', () => {
    const details = parseVehicleInventory({
      id: 999,
      year: 2025,
      make: { name: 'Tesla' },
      model: { name: 'Model Y' },
    });
    expect(details.vin).toBeNull();
    expect(details.stockId).toBeNull();
    expect(details.trim).toBeNull();
    expect(details.price).toBeNull();
    expect(details.electricInfo).toBeNull();
    expect(details.specs).toEqual([]);
    expect(details.imageManifest).toEqual([]);
    expect(details.pricingHistory).toEqual([]);
    expect(details.vhrPreview).toEqual([]);
  });

  it('handles make/model as plain strings', () => {
    const details = parseVehicleInventory({
      id: 999,
      year: 2025,
      make: 'Tesla',
      model: 'Model Y',
    });
    expect(details.make).toBe('Tesla');
    expect(details.model).toBe('Model Y');
  });

  it('handles electricComponentInfo with partial fields', () => {
    const details = parseVehicleInventory({
      id: 999,
      year: 2025,
      make: { name: 'Rivian' },
      model: { name: 'R1S' },
      electricComponentInfo: {
        batteryRange: 320,
        batteryType: 'Lithium-Ion',
      },
    });
    expect(details.electricInfo).not.toBeNull();
    expect(details.electricInfo!.batteryRange).toBe(320);
    expect(details.electricInfo!.batteryType).toBe('Lithium-Ion');
    expect(details.electricInfo!.electricMotorCount).toBeNull();
  });
});
