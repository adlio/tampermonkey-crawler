import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractListing, extractAllListings, matchesCarMax } from '../extractors.js';

let doc: Document;

beforeAll(() => {
  const html = readFileSync(resolve(__dirname, '../__fixtures__/carmax-results.html'), 'utf-8');
  document.body.innerHTML = html;
  doc = document;
});

describe('extractListing', () => {
  it('extracts title, price, mileage, link, and vin', () => {
    const card = doc.querySelector('.car-tile')!;
    const result = extractListing(card)!;
    expect(result.title).toBe('2022 Toyota Sienna XLE Premium');
    expect(result.price).toBe('$32,998');
    expect(result.mileage).toBe('45,231 mi');
    expect(result.link).toBe('/car/22222/2022-toyota-sienna-xle-premium');
    expect(result.vin).toBe('1NXAA52E87Z000111');
  });

  it('extracts data from the second listing', () => {
    const cards = doc.querySelectorAll('.car-tile');
    const result = extractListing(cards[1])!;
    expect(result.title).toBe('2021 Hyundai Santa Fe Calligraphy');
    expect(result.price).toBe('$29,499');
    expect(result.mileage).toBe('38,102 mi');
    expect(result.link).toBe('/car/33333/2021-hyundai-santa-fe-calligraphy');
    expect(result.vin).toBe('5XYPH4A10MG000222');
  });

  it('handles missing fields gracefully (returns null for missing)', () => {
    const cards = doc.querySelectorAll('.car-tile');
    const result = extractListing(cards[2])!;
    expect(result.title).toBe('2019 BMW 5 Series 530i');
    expect(result.price).toBeNull();
    expect(result.mileage).toBeNull();
    expect(result.link).toBe('/car/44444/2019-bmw-5-series-530i');
    expect(result.vin).toBe('WBAJB1C51KB000333');
  });
});

describe('extractAllListings', () => {
  it('returns correct count', () => {
    const result = extractAllListings(doc);
    expect(result.items.length).toBe(3);
    expect(result.errors.length).toBe(0);
  });

  it('extracts all VINs', () => {
    const result = extractAllListings(doc);
    const vins = result.items.map((l) => l.vin);
    expect(vins).toEqual(['1NXAA52E87Z000111', '5XYPH4A10MG000222', 'WBAJB1C51KB000333']);
  });
});

describe('matchesCarMax', () => {
  it('returns true for CarMax search URLs', () => {
    expect(matchesCarMax('https://www.carmax.com/cars/toyota-sienna')).toBe(true);
    expect(matchesCarMax('https://carmax.com/cars?search=camry')).toBe(true);
  });

  it('returns false for non-matching URLs', () => {
    expect(matchesCarMax('https://www.carmax.com/')).toBe(false);
    expect(matchesCarMax('https://www.carmax.com/sell-my-car')).toBe(false);
    expect(matchesCarMax('https://www.google.com')).toBe(false);
  });
});
