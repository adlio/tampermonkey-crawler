import type { DealerListing, DealerPlatformExtractor } from '../types.js';
import { parseVehicleTitle, extractCards } from '../types.js';

const CARD_SELECTOR = '.vehicle-item.js-vehicle-item';

function getHighlightValue(card: Element, label: string): string | undefined {
  const items = card.querySelectorAll('.vehicle-highlights__additional-item');
  for (const item of items) {
    const labelEl = item.querySelector('.vehicle-highlights__additional-label');
    if (labelEl?.textContent?.trim() === label) {
      return (
        item.querySelector('.vehicle-highlights__additional-value')?.textContent?.trim() ||
        undefined
      );
    }
    // Some sites use tooltip attribute instead of visible label
    if ((item as HTMLElement).getAttribute('data-original-title') === label) {
      return (
        item.querySelector('.vehicle-highlights__additional-value')?.textContent?.trim() ||
        undefined
      );
    }
  }
  return undefined;
}

function getColor(card: Element, type: 'Exterior' | 'Interior'): string | undefined {
  const colorEls = card.querySelectorAll('.vehicle-highlights__color[data-content]');
  for (const el of colorEls) {
    const content = el.getAttribute('data-content') || '';
    if (content.startsWith(`${type}:`)) {
      return content.replace(`${type}:`, '').trim() || undefined;
    }
  }
  return undefined;
}

function extractVinFromImageUrl(url: string): string | undefined {
  const match = url.match(/VAMP\d+-([A-HJ-NPR-Z0-9]{17})/i);
  return match?.[1]?.toUpperCase();
}

function extractListing(card: Element): DealerListing | null {
  const carfaxEl = card.querySelector('[data-vin]');
  let vin = carfaxEl?.getAttribute('data-vin') || undefined;

  const imgEl = card.querySelector(
    'img.vehicle-item__image, img.js-vehicle-item-image',
  ) as HTMLImageElement | null;
  if (!vin && imgEl?.src) {
    vin = extractVinFromImageUrl(imgEl.src);
  }

  const titleEl = card.querySelector('h6.vehicle-item__title, .js-vehicle-item-title');
  const titleText = titleEl?.textContent?.trim() || '';
  const parsed = parseVehicleTitle(titleText);

  const linkEl = card.querySelector('a.js-vehicle-item-link') as HTMLAnchorElement | null;
  const link = linkEl?.href || undefined;

  const imageUrl = imgEl?.src || imgEl?.getAttribute('data-src') || undefined;

  // Price: .price_value (profile-advanced) or .one-price (profile-one-price-no-label)
  const priceEl =
    card.querySelector('.price.__final-price .price_value') || card.querySelector('.one-price');
  const priceText = priceEl?.textContent || '';
  const price = parseInt(priceText.replace(/[^0-9]/g, ''), 10) || undefined;

  const stockNumber = getHighlightValue(card, 'Stock');
  const mileageText = getHighlightValue(card, 'Mileage') || '';
  const mileage = parseInt(mileageText.replace(/[^0-9]/g, ''), 10) || undefined;

  const exteriorColor = getColor(card, 'Exterior');
  const interiorColor = getColor(card, 'Interior');

  const id = vin || stockNumber || (card as HTMLElement).dataset.vuid || titleText;
  if (!id) return null;

  return {
    id,
    title: titleText,
    year: parsed.year,
    make: parsed.make,
    model: parsed.model,
    price,
    mileage,
    vin,
    stockNumber,
    imageUrl,
    link,
    exteriorColor,
    interiorColor,
  };
}

export const dealerFireExtractor: DealerPlatformExtractor = {
  cardSelector: CARD_SELECTOR,
  extractAllListings: (root) => extractCards(root, CARD_SELECTOR, extractListing),

  async loadMore(): Promise<boolean> {
    const showAllBtn = document.querySelector('a.js-pagination-btn') as HTMLAnchorElement | null;
    if (!showAllBtn) return false;
    showAllBtn.click();
    return true;
  },
};
