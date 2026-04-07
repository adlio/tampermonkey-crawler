import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  extractListing,
  extractAllListings,
  matchesCarvana,
  parseNativePayload,
  parseTitle,
  parsePrice,
  parseBatteryPack,
  extractVinFromHtml,
  parseDetailPageHtml,
  parseVehicleDetails,
} from '../extractors.js';

let doc: Document;

beforeAll(() => {
  const html = readFileSync(resolve(__dirname, '../__fixtures__/carvana-results.html'), 'utf-8');
  document.body.innerHTML = html;
  doc = document;
});

describe('parseNativePayload', () => {
  it('parses vehicleId from JSON string', () => {
    const result = parseNativePayload(
      '{"action":"view-vdp","searchRequestId":"abc","vehicleId":4298333}',
    );
    expect(result).toEqual({ vehicleId: '4298333' });
  });

  it('returns null for invalid JSON', () => {
    expect(parseNativePayload('not json')).toBeNull();
  });

  it('returns null for missing vehicleId', () => {
    expect(parseNativePayload('{"action":"view-vdp"}')).toBeNull();
  });
});

describe('parseTitle', () => {
  it('parses year, make, and model', () => {
    const result = parseTitle('2025 Rivian R1S');
    expect(result.year).toBe(2025);
    expect(result.make).toBe('Rivian');
    expect(result.model).toBe('R1S');
  });

  it('handles hyphenated make names', () => {
    const result = parseTitle('2023 Mercedes-Benz C-Class');
    expect(result.make).toBe('Mercedes-Benz');
    expect(result.model).toBe('C-Class');
  });

  it('handles multi-word model names', () => {
    const result = parseTitle('2026 Hyundai Santa Fe');
    expect(result.make).toBe('Hyundai');
    expect(result.model).toBe('Santa Fe');
  });

  it('returns nulls for unparseable title', () => {
    const result = parseTitle('No Year Here');
    expect(result).toEqual({ year: null, make: null, model: null });
  });
});

describe('parsePrice', () => {
  it('extracts numeric price from formatted string', () => {
    expect(parsePrice('$73,590')).toBe(73590);
  });

  it('returns null for null input', () => {
    expect(parsePrice(null)).toBeNull();
  });

  it('returns null for non-price text', () => {
    expect(parsePrice('no price')).toBeNull();
  });
});

describe('parseBatteryPack', () => {
  it('parses Standard pack from trim', () => {
    expect(parseBatteryPack('Dual Standard Dual-Motor')).toBe('Standard');
  });

  it('parses Large pack from trim', () => {
    expect(parseBatteryPack('Dual Large Dual-Motor')).toBe('Large');
    expect(parseBatteryPack('Quad Large Quad-Motor')).toBe('Large');
  });

  it('parses Max pack from trim', () => {
    expect(parseBatteryPack('Dual Max Dual-Motor')).toBe('Max');
  });

  it('returns null for non-Rivian trims', () => {
    expect(parseBatteryPack('C 300 4MATIC')).toBeNull();
    expect(parseBatteryPack('Launch Edition Quad-Motor')).toBeNull();
    expect(parseBatteryPack('Adventure Dual-Motor')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parseBatteryPack(null)).toBeNull();
  });
});

describe('extractListing', () => {
  it('extracts all fields from a normal listing', () => {
    const card = doc
      .querySelector('[data-native-payload*="4298333"]')!
      .closest('[data-testid="result-tile"]')!;
    const result = extractListing(card)!;
    expect(result.vehicleId).toBe('4298333');
    expect(result.title).toBe('2026 Rivian R1S');
    expect(result.year).toBe(2026);
    expect(result.make).toBe('Rivian');
    expect(result.model).toBe('R1S');
    expect(result.trim).toBe('Dual Standard Dual-Motor');
    expect(result.price).toBe('$72,990');
    expect(result.priceNumeric).toBe(72990);
    expect(result.originalPrice).toBeNull();
    expect(result.mileage).toBe('5k miles');
    expect(result.link).toBe('/vehicle/4298333?refSource=srp');
    expect(result.imageUrl).toContain('standardizedHero.jpg');
    expect(result.monthlyPayment).toBe('$1,162/mo');
    expect(result.downPayment).toBe('0');
    expect(result.isFreeShipping).toBe(true);
    expect(result.shippingCost).toBeNull();
    expect(result.deliveryEstimate).toBe('Get it Friday');
    expect(result.isPriceDrop).toBe(false);
    expect(result.isGreatDeal).toBe(false);
    expect(result.statusTag).toBeNull();
    expect(result.batteryPack).toBe('Standard');
  });

  it('detects Price Drop with original price', () => {
    const card = doc
      .querySelector('[data-native-payload*="4256060"]')!
      .closest('[data-testid="result-tile"]')!;
    const result = extractListing(card)!;
    expect(result.vehicleId).toBe('4256060');
    expect(result.title).toBe('2025 Rivian R1S');
    expect(result.isPriceDrop).toBe(true);
    expect(result.isGreatDeal).toBe(false);
    expect(result.price).toBe('$73,590');
    expect(result.priceNumeric).toBe(73590);
    expect(result.originalPrice).toBe('$73,990');
    expect(result.shippingCost).toBe('$1,590 shipping');
    expect(result.isFreeShipping).toBe(false);
    expect(result.downPayment).toBe('2100');
  });

  it('detects Great Deal tag and Max battery pack', () => {
    const card = doc
      .querySelector('[data-native-payload*="4039760"]')!
      .closest('[data-testid="result-tile"]')!;
    const result = extractListing(card)!;
    expect(result.isGreatDeal).toBe(true);
    expect(result.isPriceDrop).toBe(false);
    expect(result.trim).toBe('Dual Max Dual-Motor');
    expect(result.batteryPack).toBe('Max');
    expect(result.statusTag).toBeNull();
  });

  it('detects Purchase in progress status', () => {
    const card = doc
      .querySelector('[data-native-payload*="3844009"]')!
      .closest('[data-testid="result-tile"]')!;
    const result = extractListing(card)!;
    expect(result.vehicleId).toBe('3844009');
    expect(result.isPriceDrop).toBe(true);
    expect(result.isGreatDeal).toBe(true);
    expect(result.originalPrice).toBe('$70,990');
    expect(result.statusTag).toBe('Purchase in progress');
    expect(result.batteryPack).toBe('Large');
  });

  it('handles multi-word make (Mercedes-Benz)', () => {
    const card = doc
      .querySelector('[data-native-payload*="4213039"]')!
      .closest('[data-testid="result-tile"]')!;
    const result = extractListing(card)!;
    expect(result.make).toBe('Mercedes-Benz');
    expect(result.model).toBe('C-Class');
    expect(result.trim).toBe('C 300 4MATIC');
    expect(result.batteryPack).toBeNull();
  });
});

describe('extractAllListings', () => {
  it('extracts only the 5 real listings, not the recommendation', () => {
    const result = extractAllListings(doc);
    expect(result.items.length).toBe(5);
    expect(result.errors.length).toBe(0);
  });

  it('excludes cards outside #results-section', () => {
    const result = extractAllListings(doc);
    const vehicleIds = result.items.map((l) => l.vehicleId);
    expect(vehicleIds).toEqual(['4298333', '4256060', '4039760', '3844009', '4213039']);
    expect(vehicleIds).not.toContain('9999999');
  });

  it('reports errors for cards with missing data', () => {
    const container = document.createElement('div');
    container.id = 'results-section';
    // Card with no vehicle link
    container.innerHTML = '<div data-testid="result-tile"><div>empty card</div></div>';
    const result = extractAllListings(container);
    expect(result.items.length).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toBe('Missing vehicle ID or title');
  });
});

describe('matchesCarvana', () => {
  it('matches search results URLs', () => {
    expect(matchesCarvana('https://www.carvana.com/cars')).toBe(true);
    expect(matchesCarvana('https://www.carvana.com/cars/rivian-r1s')).toBe(true);
    expect(matchesCarvana('https://www.carvana.com/cars/rivian-r1s?year-min=2025')).toBe(true);
    expect(matchesCarvana('https://www.carvana.com/cars?page=2')).toBe(true);
  });

  it('does not match detail pages or other pages', () => {
    expect(matchesCarvana('https://www.carvana.com/vehicle/3844009')).toBe(false);
    expect(matchesCarvana('https://www.carvana.com/')).toBe(false);
    expect(matchesCarvana('https://www.carvana.com/sell-trade')).toBe(false);
    expect(matchesCarvana('https://www.google.com')).toBe(false);
  });
});

describe('extractVinFromHtml', () => {
  it('extracts VIN from __NEXT_DATA__', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"forProviders":{"forVehicleContext":{"vehicleDetails":{"vehicleId":3844009,"vin":"7PDSGABA0RN043651","year":2024,"make":"Rivian","model":"R1S"}}}}}}</script>`;
    expect(extractVinFromHtml(html)).toBe('7PDSGABA0RN043651');
  });

  it('falls back to regex when __NEXT_DATA__ missing', () => {
    const html = '<div>"vin":"5YJ3E1EA1PF123456"</div>';
    expect(extractVinFromHtml(html)).toBe('5YJ3E1EA1PF123456');
  });

  it('returns null when VIN not found', () => {
    expect(extractVinFromHtml('<div>no vin here</div>')).toBeNull();
  });
});

describe('parseDetailPageHtml', () => {
  const makeDetailHtml = (vehicleDetails: object) =>
    `<html><head></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          forProviders: {
            forVehicleContext: { vehicleDetails },
          },
        },
      },
    })}</script></body></html>`;

  it('extracts full vehicle details from detail page', () => {
    const html = makeDetailHtml({
      vehicleId: 3844009,
      stockNumber: 2004007437,
      vin: '7PDSGABA0RN043651',
      year: 2024,
      make: 'Rivian',
      model: 'R1S',
      trim: 'Quad Large Sport Utility 4D',
      price: 70590,
      mileage: 18012,
      bodyType: 'SUV',
      exteriorColor: 'Green',
      interiorColor: 'Black',
      drivetrainDescription: 'AWD',
      engineDescription: 'Quad Electric Motors',
      transmission: 'Single-Speed Fixed Gear',
      fuelDescription: 'Electric',
      horsePower: 835,
      evRange: 274,
      seating: 7,
      doors: 4,
      saleStatus: 'Available',
      location: { city: 'Lorain', stateAbbreviation: 'OH' },
      highlights: [
        { tagName: 'No Reported Accidents', tagKey: 'AccidentFree' },
        { tagName: 'New Price', tagKey: 'RecentPriceDrop' },
      ],
      vexVdpImageData: {
        heroes: {
          hero: 'https://vexgateway.fastly.carvana.io/hero.jpg',
        },
        features: [
          {
            title: 'Synthetic Leather Seats',
            location: 'interior',
            imageUrl: 'https://vexgateway.fastly.carvana.io/feature-seats.jpg',
          },
          {
            title: 'Alloy Wheels',
            location: 'exterior',
            imageUrl: 'https://vexgateway.fastly.carvana.io/feature-wheels.jpg',
          },
        ],
        cutouts: [
          { desktopURL: 'https://vexgateway.fastly.carvana.io/cutout-0.png', angleDegrees: 45 },
        ],
        imperfections: [{ imageUrl: 'https://vexgateway.fastly.carvana.io/imperfection-0.jpg' }],
      },
    });

    const details = parseDetailPageHtml(html)!;
    expect(details).not.toBeNull();
    expect(details.vehicleId).toBe(3844009);
    expect(details.stockNumber).toBe(2004007437);
    expect(details.vin).toBe('7PDSGABA0RN043651');
    expect(details.year).toBe(2024);
    expect(details.make).toBe('Rivian');
    expect(details.model).toBe('R1S');
    expect(details.trim).toBe('Quad Large Sport Utility 4D');
    expect(details.price).toBe(70590);
    expect(details.mileage).toBe(18012);
    expect(details.bodyType).toBe('SUV');
    expect(details.exteriorColor).toBe('Green');
    expect(details.interiorColor).toBe('Black');
    expect(details.drivetrain).toBe('AWD');
    expect(details.engine).toBe('Quad Electric Motors');
    expect(details.transmission).toBe('Single-Speed Fixed Gear');
    expect(details.fuelType).toBe('Electric');
    expect(details.horsepower).toBe(835);
    expect(details.evRange).toBe(274);
    expect(details.seating).toBe(7);
    expect(details.doors).toBe(4);
    expect(details.saleStatus).toBe('Available');
    expect(details.location).toEqual({ city: 'Lorain', state: 'OH' });
  });

  it('extracts specs from vehicle fields', () => {
    const html = makeDetailHtml({
      vehicleId: 123,
      year: 2024,
      make: 'Rivian',
      model: 'R1S',
      horsePower: 835,
      evRange: 274,
      fuelDescription: 'Electric',
      drivetrainDescription: 'AWD',
      vexVdpImageData: null,
    });

    const details = parseDetailPageHtml(html)!;
    expect(details.specs).toContainEqual({ label: 'Horsepower', value: '835' });
    expect(details.specs).toContainEqual({ label: 'EV Range', value: '274 miles' });
    expect(details.specs).toContainEqual({ label: 'Fuel Type', value: 'Electric' });
    expect(details.specs).toContainEqual({ label: 'Drivetrain', value: 'AWD' });
  });

  it('extracts features from vexVdpImageData', () => {
    const html = makeDetailHtml({
      vehicleId: 123,
      year: 2024,
      make: 'Rivian',
      model: 'R1S',
      vexVdpImageData: {
        features: [
          {
            title: 'GPS Navigation',
            location: 'interior',
            imageUrl: 'https://example.com/gps.jpg',
          },
          { title: 'Alloy Wheels', location: 'exterior', imageUrl: null },
        ],
      },
    });

    const details = parseDetailPageHtml(html)!;
    expect(details.features).toHaveLength(2);
    expect(details.features[0]).toEqual({
      title: 'GPS Navigation',
      location: 'interior',
      imageUrl: 'https://example.com/gps.jpg',
    });
    expect(details.features[1].imageUrl).toBeNull();
  });

  it('builds image manifest from hero, features, cutouts, imperfections', () => {
    const html = makeDetailHtml({
      vehicleId: 123,
      year: 2024,
      make: 'Rivian',
      model: 'R1S',
      vexVdpImageData: {
        heroes: { hero: 'https://example.com/hero.jpg' },
        features: [
          { title: 'Seats', location: 'interior', imageUrl: 'https://example.com/seats.jpg' },
        ],
        cutouts: [{ desktopURL: 'https://example.com/cutout.png' }],
        imperfections: [{ imageUrl: 'https://example.com/scratch.jpg' }],
      },
    });

    const details = parseDetailPageHtml(html)!;
    expect(details.imageManifest).toHaveLength(4);
    expect(details.imageManifest[0]).toEqual({
      name: 'hero',
      category: 'hero',
      imageUrl: 'https://example.com/hero.jpg',
    });
    expect(details.imageManifest[1].category).toBe('interior');
    expect(details.imageManifest[2].category).toBe('cutout');
    expect(details.imageManifest[3].category).toBe('imperfection');
  });

  it('extracts highlights as tag names', () => {
    const html = makeDetailHtml({
      vehicleId: 123,
      year: 2024,
      make: 'Rivian',
      model: 'R1S',
      highlights: [
        { tagName: 'No Reported Accidents', tagKey: 'AccidentFree' },
        { tagName: '1-Owner Vehicle', tagKey: 'OneOwner' },
      ],
      vexVdpImageData: null,
    });

    const details = parseDetailPageHtml(html)!;
    expect(details.highlights).toEqual(['No Reported Accidents', '1-Owner Vehicle']);
  });

  it('returns null when __NEXT_DATA__ is missing', () => {
    expect(parseDetailPageHtml('<html><body>no data</body></html>')).toBeNull();
  });

  it('returns null when __NEXT_DATA__ contains invalid JSON', () => {
    const html = '<script id="__NEXT_DATA__" type="application/json">{not valid json</script>';
    expect(parseDetailPageHtml(html)).toBeNull();
  });

  it('returns null when vehicleDetails is missing', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{}}}</script>`;
    expect(parseDetailPageHtml(html)).toBeNull();
  });
});

describe('parseVehicleDetails', () => {
  it('handles missing optional fields gracefully', () => {
    const details = parseVehicleDetails({
      vehicleId: 999,
      year: 2025,
      make: 'Tesla',
      model: 'Model Y',
    });
    expect(details.vin).toBeNull();
    expect(details.stockNumber).toBeNull();
    expect(details.trim).toBeNull();
    expect(details.specs).toEqual([]);
    expect(details.features).toEqual([]);
    expect(details.imageManifest).toEqual([]);
    expect(details.highlights).toEqual([]);
    expect(details.location).toBeNull();
  });
});
