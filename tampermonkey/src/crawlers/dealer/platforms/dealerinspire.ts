import type { DealerListing, DealerPlatformExtractor } from '../types.js';
import { extractCards } from '../types.js';

const CARD_SELECTOR = '#hits > .result-wrap';

interface DiVehicleData {
  vin: string;
  stock: string;
  type: string;
  year: string;
  make: string;
  model: string;
  trim: string;
  exterior_color: string;
  price: number;
  msrp: number;
  bodystyle: string;
  fueltype: string;
}

function extractListing(card: Element): DealerListing | null {
  const raw = card.getAttribute('data-vehicle');
  if (!raw) return null;

  let v: DiVehicleData;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!v.vin) return null;

  const year = parseInt(v.year, 10) || undefined;
  const price = v.price || v.msrp || undefined;
  const title = [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ');

  const mileageEl = card.querySelector('li.mileage, li[data-testid="mileage"]');
  const mileageText = mileageEl?.textContent || '';
  const mileage = parseInt(mileageText.replace(/[^0-9]/g, ''), 10) || undefined;

  const linkEl = card.querySelector('a.hit-link') as HTMLAnchorElement | null;
  const link = linkEl?.href || undefined;

  const imgEl = card.querySelector('.hit-image img') as HTMLImageElement | null;
  const imageUrl = imgEl?.src || undefined;

  const interiorEl = card.querySelector('li[data-testid="interior-color"]');
  const interiorColor = interiorEl?.textContent?.replace(/^Interior:\s*/i, '').trim() || undefined;

  return {
    id: v.vin,
    title,
    year,
    make: v.make || undefined,
    model: v.model || undefined,
    trim: v.trim || undefined,
    price,
    mileage,
    vin: v.vin,
    stockNumber: v.stock || undefined,
    condition: v.type?.toLowerCase() || undefined,
    imageUrl,
    link,
    exteriorColor: v.exterior_color || undefined,
    interiorColor,
  };
}

export const dealerInspireExtractor: DealerPlatformExtractor = {
  cardSelector: CARD_SELECTOR,
  extractAllListings: (root) => extractCards(root, CARD_SELECTOR, extractListing),

  async loadMore(): Promise<boolean> {
    const nextLink = document.querySelector(
      '.pagination-next a.go-to-page:not(.disable)',
    ) as HTMLAnchorElement | null;
    if (!nextLink) return false;
    nextLink.click();
    return true;
  },
};
