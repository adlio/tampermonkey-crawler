import type { NormalizedCarListing } from './types.js';

/**
 * Parse a car title like "2022 Toyota Sienna XLE Premium" into components.
 * Year is the leading 4-digit number. Make is the next word. Model is the next word.
 * Everything after is trim.
 */
export function parseCarTitle(title: string): {
  year: number | null;
  make: string;
  model: string;
  trim: string | null;
} {
  const parts = title.trim().split(/\s+/);

  let year: number | null = null;
  let startIndex = 0;

  // Check if the first token is a 4-digit year
  if (parts.length > 0 && /^\d{4}$/.test(parts[0])) {
    year = parseInt(parts[0], 10);
    startIndex = 1;
  }

  const remaining = parts.slice(startIndex);
  const make = remaining[0] || '';
  const model = remaining[1] || '';
  const trimParts = remaining.slice(2);
  const trim = trimParts.length > 0 ? trimParts.join(' ') : null;

  return { year, make, model, trim };
}

/**
 * Strip "$" and commas from a price string, convert to cents (integer).
 * Returns null for empty/non-numeric input.
 */
export function parsePrice(priceStr: string | null): number | null {
  if (priceStr == null || priceStr === '') return null;

  const cleaned = priceStr.replace(/[$,]/g, '').trim();
  const num = parseFloat(cleaned);

  if (isNaN(num)) return null;

  return Math.round(num * 100);
}

/**
 * Strip commas and "mi"/"miles" from a mileage string, return integer.
 * Handles "K" suffix (e.g., "45K" -> 45000).
 * Returns null for empty input.
 */
export function parseMileage(mileageStr: string | null): number | null {
  if (mileageStr == null || mileageStr === '') return null;

  // Remove "mi", "miles", commas, and whitespace
  let cleaned = mileageStr
    .replace(/,/g, '')
    .replace(/\b(miles?|mi)\b/gi, '')
    .trim();

  // Handle K suffix (e.g., "45K" -> 45000)
  if (/^\d+(\.\d+)?[kK]$/.test(cleaned)) {
    const num = parseFloat(cleaned.replace(/[kK]$/, ''));
    return isNaN(num) ? null : Math.round(num * 1000);
  }

  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

/**
 * Transform a raw CarMax listing into the NormalizedCarListing schema.
 * Pure function with no DB access.
 */
export function transformListing(
  raw: {
    title: string | null;
    price: string | null;
    mileage: string | null;
    link: string | null;
    vin: string | null;
  },
  rawCrawlId: number,
  timestamp: string,
): NormalizedCarListing {
  const { year, make, model, trim } = parseCarTitle(raw.title || '');

  return {
    vin: raw.vin || null,
    sourceUrl: raw.link || '',
    sourceSite: 'carmax',
    sourceListingId: raw.vin || null,
    year,
    make,
    model,
    trim,
    bodyStyle: null,
    drivetrain: null,
    transmission: null,
    engine: null,
    fuelType: null,
    mileage: parseMileage(raw.mileage),
    condition: null,
    price: parsePrice(raw.price),
    priceCurrency: 'USD',
    priceLabel: raw.price || null,
    exteriorColor: null,
    interiorColor: null,
    imageUrls: [],
    thumbnailUrl: null,
    crawledAt: timestamp,
    rawCrawlId,
  };
}
