import type { DealerListing, DealerPlatformExtractor } from '../types.js';
import { parseVehicleTitle } from '../types.js';
import type { ExtractionError, ExtractionResult } from '../../../lib/types.js';

/**
 * DealerOn uses virtual scrolling — only ~1 card is in the DOM at a time.
 * Primary extraction uses JSON-LD structured data (all vehicles at once).
 * Visible cards enrich the data via rich data-* attributes.
 */

const CARD_SELECTOR = '.vehicle-card[data-vin]';

function extractFromJsonLd(root: Document | Element): DealerListing[] {
  const doc = root.ownerDocument ?? (root as Document);
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  const items: DealerListing[] = [];

  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || '');
      if (data['@type'] !== 'ItemList' || !Array.isArray(data.itemListElement)) continue;

      for (const item of data.itemListElement) {
        const vin = item.identifier;
        if (!vin) continue;
        const parsed = parseVehicleTitle(item.name || '');
        const price =
          item.offers?.price != null
            ? parseInt(String(item.offers.price), 10) || undefined
            : undefined;

        items.push({
          id: vin,
          title: item.name || '',
          year: parsed.year,
          make: parsed.make,
          model: parsed.model,
          vin,
          imageUrl: item.image || undefined,
          link: item.url || undefined,
          price,
        });
      }
    } catch {
      // skip malformed JSON-LD blocks
    }
  }

  return items;
}

function extractFromCard(card: Element, origin: string): DealerListing | null {
  const vin = card.getAttribute('data-vin');
  if (!vin) return null;

  const year = parseInt(card.getAttribute('data-year') || '', 10) || undefined;
  const make = card.getAttribute('data-make') || undefined;
  const model = card.getAttribute('data-model') || undefined;
  const trim = card.getAttribute('data-trim') || undefined;
  const name =
    card.getAttribute('data-name') || [year, make, model, trim].filter(Boolean).join(' ');
  const msrp = parseInt(card.getAttribute('data-msrp') || '', 10) || undefined;
  const price = parseInt(card.getAttribute('data-price') || '', 10) || msrp;
  const stockNumber = card.getAttribute('data-stocknum') || undefined;
  const exteriorColor = card.getAttribute('data-extcolor') || undefined;
  const interiorColor = card.getAttribute('data-intcolor') || undefined;
  const vehicleType = card.getAttribute('data-vehicletype') || undefined;

  const odometerRaw = card.getAttribute('data-dotagging-item-odometer') || '';
  const mileage = parseInt(odometerRaw.replace(/[^0-9]/g, ''), 10) || undefined;

  const mpgCity = parseInt(card.getAttribute('data-mpgcity') || '', 10) || undefined;
  const mpgHwy = parseInt(card.getAttribute('data-mpghwy') || '', 10) || undefined;
  const engine = card.getAttribute('data-engine') || undefined;
  const fuelType = card.getAttribute('data-fueltype') || undefined;
  const bodyStyle = card.getAttribute('data-bodystyle') || undefined;

  const titleLink = card.querySelector('.vehicle-title') as HTMLAnchorElement | null;
  const link = titleLink?.href || undefined;

  const photoEl = card.querySelector('[data-photo]');
  const photoPath = photoEl?.getAttribute('data-photo');
  const imageUrl = photoPath ? `${origin}/${photoPath}` : undefined;

  return {
    id: vin,
    title: name,
    year,
    make,
    model,
    trim,
    price,
    mileage,
    vin,
    stockNumber,
    condition: vehicleType,
    imageUrl,
    link,
    exteriorColor,
    interiorColor,
    mpgCity,
    mpgHwy,
    engine,
    fuelType,
    bodyStyle,
  };
}

export const dealerOnExtractor: DealerPlatformExtractor = {
  cardSelector: CARD_SELECTOR,

  extractAllListings(root: Document | Element): ExtractionResult<DealerListing> {
    const errors: ExtractionError[] = [];

    const jsonLdItems = extractFromJsonLd(root);
    const byVin = new Map<string, DealerListing>();
    for (const item of jsonLdItems) {
      byVin.set(item.vin!, item);
    }

    const origin = (root.ownerDocument ?? (root as Document)).location?.origin ?? '';
    const cards = root.querySelectorAll(CARD_SELECTOR);
    cards.forEach((card, index) => {
      try {
        const listing = extractFromCard(card, origin);
        if (listing?.vin) {
          byVin.set(listing.vin, listing);
        }
      } catch (e) {
        errors.push({ index, selector: CARD_SELECTOR, message: String(e) });
      }
    });

    return { items: Array.from(byVin.values()), errors };
  },

  async loadMore(): Promise<boolean> {
    const nextLink = document.querySelector(
      '.pagination .next a, .srpPagination a[aria-label="Next"]',
    ) as HTMLAnchorElement | null;
    if (!nextLink) return false;
    nextLink.click();
    return true;
  },
};
