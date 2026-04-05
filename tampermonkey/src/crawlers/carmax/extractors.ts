import type { CarMaxRawListing, ExtractionResult, ExtractionError } from './types.js';

/**
 * Extract structured data from a single CarMax car-tile element.
 * Pure function — no side effects, no network calls.
 */
export function extractListing(card: Element): CarMaxRawListing | null {
  const title = card.querySelector('.car-tile--title')?.textContent?.trim() ?? null;
  const price = card.querySelector('.car-tile--price')?.textContent?.trim() ?? null;
  const mileage = card.querySelector('.car-tile--mileage')?.textContent?.trim() ?? null;
  const linkEl = card.querySelector('.car-tile--link') as HTMLAnchorElement | null;
  const link = linkEl?.getAttribute('href') ?? null;
  const vin = card.getAttribute('data-vin') ?? null;

  return { title, price, mileage, link, vin };
}

/**
 * Extract all CarMax listings from a root element or document.
 * Returns both successfully extracted items and any extraction errors.
 */
export function extractAllListings(root: Element | Document): ExtractionResult<CarMaxRawListing> {
  const items: CarMaxRawListing[] = [];
  const errors: ExtractionError[] = [];

  const cards = root.querySelectorAll('.car-tile');

  Array.from(cards).forEach((card, index) => {
    try {
      const result = extractListing(card);
      if (result) {
        items.push(result);
      } else {
        errors.push({
          index,
          selector: '.car-tile',
          message: 'Failed to extract listing from card element',
        });
      }
    } catch (err) {
      errors.push({
        index,
        selector: '.car-tile',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return { items, errors };
}

/**
 * Check whether a URL matches the CarMax search results pattern.
 */
export function matchesCarMax(url: string): boolean {
  return url.includes('carmax.com/cars');
}
