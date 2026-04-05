import { describe, it, expect } from 'vitest';
import { parseCarTitle, parsePrice, parseMileage, transformListing } from '../carmax.js';

describe('parseCarTitle', () => {
  it('parses "2022 Toyota Sienna XLE Premium" into components', () => {
    const result = parseCarTitle('2022 Toyota Sienna XLE Premium');
    expect(result).toEqual({
      year: 2022,
      make: 'Toyota',
      model: 'Sienna',
      trim: 'XLE Premium',
    });
  });

  it('parses "Toyota Sienna" (no year) with year as null', () => {
    const result = parseCarTitle('Toyota Sienna');
    expect(result).toEqual({
      year: null,
      make: 'Toyota',
      model: 'Sienna',
      trim: null,
    });
  });

  it('parses "2023 BMW X5 M50i xDrive" with multi-word trim', () => {
    const result = parseCarTitle('2023 BMW X5 M50i xDrive');
    expect(result).toEqual({
      year: 2023,
      make: 'BMW',
      model: 'X5',
      trim: 'M50i xDrive',
    });
  });
});

describe('parsePrice', () => {
  it('parses "$32,998" to 3299800 cents', () => {
    expect(parsePrice('$32,998')).toBe(3299800);
  });

  it('parses "$0" to 0 cents', () => {
    expect(parsePrice('$0')).toBe(0);
  });

  it('returns null for null input', () => {
    expect(parsePrice(null)).toBeNull();
  });

  it('returns null for "No Price Listed"', () => {
    expect(parsePrice('No Price Listed')).toBeNull();
  });
});

describe('parseMileage', () => {
  it('parses "45,231 mi" to 45231', () => {
    expect(parseMileage('45,231 mi')).toBe(45231);
  });

  it('parses "12K mi" to 12000', () => {
    expect(parseMileage('12K mi')).toBe(12000);
  });

  it('returns null for null input', () => {
    expect(parseMileage(null)).toBeNull();
  });
});

describe('transformListing', () => {
  it('transforms a full listing with all fields populated', () => {
    const raw = {
      title: '2022 Toyota Sienna XLE Premium',
      price: '$32,998',
      mileage: '45,231 mi',
      link: 'https://www.carmax.com/car/12345',
      vin: '1A2B3C4D5E6F78901',
    };
    const result = transformListing(raw, 42, '2025-12-20T10:00:00Z');

    expect(result).toEqual({
      vin: '1A2B3C4D5E6F78901',
      sourceUrl: 'https://www.carmax.com/car/12345',
      sourceSite: 'carmax',
      sourceListingId: '1A2B3C4D5E6F78901',
      year: 2022,
      make: 'Toyota',
      model: 'Sienna',
      trim: 'XLE Premium',
      bodyStyle: null,
      drivetrain: null,
      transmission: null,
      engine: null,
      fuelType: null,
      mileage: 45231,
      condition: null,
      price: 3299800,
      priceCurrency: 'USD',
      priceLabel: '$32,998',
      exteriorColor: null,
      interiorColor: null,
      imageUrls: [],
      thumbnailUrl: null,
      crawledAt: '2025-12-20T10:00:00Z',
      rawCrawlId: 42,
    });
  });

  it('handles null/missing fields gracefully', () => {
    const raw = {
      title: null,
      price: null,
      mileage: null,
      link: null,
      vin: null,
    };
    const result = transformListing(raw, 99, '2025-12-20T10:00:00Z');

    expect(result).toEqual({
      vin: null,
      sourceUrl: '',
      sourceSite: 'carmax',
      sourceListingId: null,
      year: null,
      make: '',
      model: '',
      trim: null,
      bodyStyle: null,
      drivetrain: null,
      transmission: null,
      engine: null,
      fuelType: null,
      mileage: null,
      condition: null,
      price: null,
      priceCurrency: 'USD',
      priceLabel: null,
      exteriorColor: null,
      interiorColor: null,
      imageUrls: [],
      thumbnailUrl: null,
      crawledAt: '2025-12-20T10:00:00Z',
      rawCrawlId: 99,
    });
  });
});
