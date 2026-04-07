import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  extractListing,
  extractAllListings,
  matchesCarMax,
  parseClickProps,
  parseTitle,
  extractVinFromHtml,
  parseSpecsApi,
  parseImageManifest,
  parseFeatures,
} from '../extractors.js';

let doc: Document;

beforeAll(() => {
  const html = readFileSync(resolve(__dirname, '../__fixtures__/carmax-results.html'), 'utf-8');
  document.body.innerHTML = html;
  doc = document;
});

describe('parseClickProps', () => {
  it('parses key-value pairs from clickprops string', () => {
    const result = parseClickProps(
      'Element type: Car Tile,StockNumber: 28099103,YMM: 2025 Rivian R1S,Price: 66998,Coming Soon: false,Reserved: false,Marked Down: false',
    );
    expect(result['StockNumber']).toBe('28099103');
    expect(result['YMM']).toBe('2025 Rivian R1S');
    expect(result['Price']).toBe('66998');
    expect(result['Coming Soon']).toBe('false');
    expect(result['Reserved']).toBe('false');
  });
});

describe('parseTitle', () => {
  it('parses year, make, model, and trim', () => {
    const result = parseTitle('2025 Rivian R1S Adventure Dual-Motor Standard');
    expect(result.year).toBe(2025);
    expect(result.make).toBe('Rivian');
    expect(result.model).toBe('R1S');
    expect(result.trim).toBe('Adventure Dual-Motor Standard');
  });

  it('handles title with no trim', () => {
    const result = parseTitle('2024 Toyota Corolla');
    expect(result.year).toBe(2024);
    expect(result.make).toBe('Toyota');
    expect(result.model).toBe('Corolla');
    expect(result.trim).toBeNull();
  });

  it('handles hyphenated make names', () => {
    const result = parseTitle('2020 Mercedes-Benz GLB250');
    expect(result.make).toBe('Mercedes-Benz');
    expect(result.model).toBe('GLB250');
  });
});

describe('extractListing', () => {
  it('extracts all fields from a shipping card', () => {
    const card = doc.querySelector('[data-id="28099103"]')!;
    const result = extractListing(card)!;
    expect(result.stockNumber).toBe('28099103');
    expect(result.title).toBe('2025 Rivian R1S Adventure Dual-Motor Standard');
    expect(result.year).toBe(2025);
    expect(result.make).toBe('Rivian');
    expect(result.model).toBe('R1S');
    expect(result.trim).toBe('Adventure Dual-Motor Standard');
    expect(result.price).toBe('$66,998*');
    expect(result.priceNumeric).toBe(66998);
    expect(result.mileage).toBe('22K mi');
    expect(result.link).toBe('/car/28099103');
    expect(result.imageUrl).toContain('28099103/hero.jpg');
    expect(result.shippingCost).toBe('$549 Shipping');
    expect(result.monthlyEstimate).toBe('Est. $1,050/mo');
    expect(result.isReserved).toBe(false);
    expect(result.isComingSoon).toBe(false);
    expect(result.isMarkedDown).toBe(false);
  });

  it('detects reserved status', () => {
    const card = doc.querySelector('[data-id="28164786"]')!;
    const result = extractListing(card)!;
    expect(result.title).toBe('2024 Kia EV9 GT-Line');
    expect(result.isReserved).toBe(true);
    expect(result.isComingSoon).toBe(false);
    expect(result.location).toContain('Reserved');
    expect(result.shippingCost).toBeNull();
  });

  it('detects coming soon status', () => {
    const card = doc.querySelector('[data-id="28510169"]')!;
    const result = extractListing(card)!;
    expect(result.title).toBe('2025 Rivian R1S Adventure Dual-Motor Max');
    expect(result.isComingSoon).toBe(true);
    expect(result.isReserved).toBe(false);
    expect(result.location).toContain('Coming soon');
  });

  it('detects marked down status', () => {
    const card = doc.querySelector('[data-id="28092917"]')!;
    const result = extractListing(card)!;
    expect(result.title).toBe('2024 Toyota Corolla LE');
    expect(result.isMarkedDown).toBe(true);
    expect(result.location).toContain('Beaverton');
  });

  it('handles local test-drive card', () => {
    const card = doc.querySelector('[data-id="28092917"]')!;
    const result = extractListing(card)!;
    expect(result.location).toContain('Test drive today');
    expect(result.shippingCost).toBeNull();
  });
});

describe('extractAllListings', () => {
  it('extracts only the 5 real listings, not the recommendation', () => {
    const result = extractAllListings(doc);
    expect(result.items.length).toBe(5);
    expect(result.errors.length).toBe(0);
  });

  it('excludes recommendation cards outside .listing-container', () => {
    const result = extractAllListings(doc);
    const stockNumbers = result.items.map((l) => l.stockNumber);
    expect(stockNumbers).toEqual(['28099103', '28164786', '28510169', '28092917', '28555001']);
    expect(stockNumbers).not.toContain('99999999');
  });

  it('includes the Land Cruiser 1958 edition', () => {
    const result = extractAllListings(doc);
    const lc1958 = result.items.find((i) => i.stockNumber === '28555001');
    expect(lc1958).toBeDefined();
    expect(lc1958!.title).toBe('2025 Toyota Land Cruiser 1958');
    expect(lc1958!.trim).toBe('Cruiser 1958');
  });
});

describe('extractVinFromHtml', () => {
  it('extracts VIN from detail page HTML', () => {
    const html = '<span>VIN</span><span>7PDSGBBAXSN046004</span>';
    expect(extractVinFromHtml(html)).toBe('7PDSGBBAXSN046004');
  });

  it('returns null when VIN not found', () => {
    expect(extractVinFromHtml('<div>no vin here</div>')).toBeNull();
  });
});

describe('parseSpecsApi', () => {
  const sampleData = [
    {
      displayName: 'Battery',
      specifications: [
        { displayName: 'Range (when new)', displayValue: '270 miles' },
        { displayName: 'Time to fully charge battery (240V)', displayValue: '15.2 hours' },
        { displayName: 'Battery capacity', displayValue: '99.8' },
      ],
    },
    {
      displayName: 'Overview',
      specifications: [
        { displayName: 'Motor', displayValue: 'Electric' },
        { displayName: 'Drive Type', displayValue: 'All Wheel Drive' },
        { displayName: 'Horsepower', displayValue: '' },
      ],
    },
  ];

  it('extracts specs with values and skips empty ones', () => {
    const specs = parseSpecsApi(sampleData);
    expect(specs.length).toBe(5);
    expect(specs).not.toContainEqual(expect.objectContaining({ label: 'Horsepower' }));
  });

  it('includes battery range and capacity', () => {
    const specs = parseSpecsApi(sampleData);
    expect(specs).toContainEqual({ label: 'Range (when new)', value: '270 miles' });
    expect(specs).toContainEqual({ label: 'Battery capacity', value: '99.8' });
  });

  it('includes charge time', () => {
    const specs = parseSpecsApi(sampleData);
    expect(specs).toContainEqual({
      label: 'Time to fully charge battery (240V)',
      value: '15.2 hours',
    });
  });
});

describe('parseImageManifest', () => {
  it('extracts image entries and skips non-image types', () => {
    const data = {
      items: [
        {
          type: 'image',
          name: 'hero.jpg',
          thumbnailUrl: '/thumb/hero.jpg',
          fullSizeUrl: '/full/hero.jpg',
          metadata: {},
        },
        {
          type: '360-exterior',
          name: 'spin',
          thumbnailUrl: '/thumb/spin',
          fullSizeUrl: '/full/spin',
          metadata: {},
        },
        {
          type: 'image',
          name: '1.jpg',
          thumbnailUrl: '/thumb/1.jpg',
          fullSizeUrl: '/full/1.jpg',
          metadata: { category: 'Exterior' },
        },
        {
          type: 'image',
          name: '10.jpg',
          thumbnailUrl: '/thumb/10.jpg',
          fullSizeUrl: '/full/10.jpg',
          metadata: { category: 'Interior' },
        },
      ],
    };
    const images = parseImageManifest(data);
    expect(images.length).toBe(3);
    expect(images[0]).toEqual({
      name: 'hero.jpg',
      type: 'image',
      category: null,
      thumbnailUrl: '/thumb/hero.jpg',
      fullSizeUrl: '/full/hero.jpg',
    });
    expect(images[1].category).toBe('Exterior');
    expect(images[2].category).toBe('Interior');
  });
});

describe('parseFeatures', () => {
  it('extracts Feature type hotspots', () => {
    const hotspots = [
      { title: 'Power Seat(s)', hotspotType: 'Feature' },
      { title: 'Replaced Four Tires', hotspotType: 'Reconditioning' },
      { title: 'Navigation System', hotspotType: 'Feature' },
    ];
    const features = parseFeatures(hotspots);
    expect(features).toEqual(['Power Seat(s)', 'Navigation System']);
  });
});

describe('matchesCarMax', () => {
  it('matches search results URLs', () => {
    expect(matchesCarMax('https://www.carmax.com/cars/suv')).toBe(true);
    expect(matchesCarMax('https://www.carmax.com/cars/rivian/r1s?year=2025-0')).toBe(true);
    expect(matchesCarMax('https://www.carmax.com/cars?search=camry')).toBe(true);
    expect(matchesCarMax('https://www.carmax.com/cars')).toBe(true);
  });

  it('does not match detail pages or other pages', () => {
    expect(matchesCarMax('https://www.carmax.com/car/28092917')).toBe(false);
    expect(matchesCarMax('https://www.carmax.com/')).toBe(false);
    expect(matchesCarMax('https://www.carmax.com/sell-my-car')).toBe(false);
    expect(matchesCarMax('https://www.google.com')).toBe(false);
  });
});
