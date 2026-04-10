import type { DealerListing, DealerPlatformExtractor } from '../types.js';
import { parseVehicleTitle } from '../types.js';
import type { ExtractionError, ExtractionResult } from '../../../lib/types.js';

const CARD_SELECTOR = '.clean-design-srp-card';

function getDetailValue(card: Element, label: string): string | undefined {
  const labels = card.querySelectorAll('.details-item-label');
  for (const labelEl of labels) {
    if (labelEl.textContent?.trim() === label) {
      // Value is the next sibling element
      const sibling = labelEl.nextElementSibling;
      if (sibling?.classList.contains('details-item-value')) {
        return sibling.textContent?.trim() || undefined;
      }
    }
  }
  return undefined;
}

function extractFromJsonLd(doc: Document | Element): Map<string, Partial<DealerListing>> {
  const ownerDoc = doc.ownerDocument ?? (doc as Document);
  const scripts = ownerDoc.querySelectorAll('script[type="application/ld+json"]');
  const map = new Map<string, Partial<DealerListing>>();

  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || '');
      if (data['@type'] !== 'Car') continue;

      const vin = data.vehicleIdentificationNumber;
      if (!vin) continue;

      const year = parseInt(data.vehicleModelDate, 10) || undefined;
      const mileageVal = data.mileageFromOdometer?.value;
      const mileage = mileageVal ? parseInt(String(mileageVal), 10) || undefined : undefined;
      const price = data.offers?.price
        ? parseInt(String(data.offers.price), 10) || undefined
        : undefined;
      const imageUrl = data.image?.contentUrl || undefined;
      const link = data.offers?.url || undefined;
      const condition = data.itemCondition?.includes('Used') ? 'used' : 'new';

      map.set(vin, {
        id: vin,
        title: data.name || '',
        vin,
        year,
        make: data.brand || undefined,
        model: data.model || undefined,
        price,
        mileage,
        imageUrl,
        link,
        condition,
        exteriorColor: data.color || undefined,
        interiorColor: data.vehicleInteriorColor || undefined,
        stockNumber: data.sku || undefined,
      });
    } catch {
      // skip malformed JSON-LD
    }
  }

  return map;
}

function extractFromCard(card: Element): DealerListing | null {
  // VIN from data-vin attribute on icon element or from data-itemid
  const vinEl = card.querySelector('[data-vin]');
  let vin = vinEl?.getAttribute('data-vin') || undefined;

  if (!vin) {
    // data-itemid format: "Make-Model-Trim-VIN"
    const itemId = card.getAttribute('data-itemid') || '';
    const parts = itemId.split('-');
    const lastPart = parts[parts.length - 1];
    if (lastPart && /^[A-HJ-NPR-Z0-9]{17}$/i.test(lastPart)) {
      vin = lastPart.toUpperCase();
    }
  }

  // Title
  const titleEl = card.querySelector('h1.vehiclebox-title-main, .vehiclebox-title-main');
  const titleText = titleEl?.textContent?.trim() || '';
  const parsed = parseVehicleTitle(titleText);

  // Image
  const imgEl = card.querySelector('img.srp-vehiclebox-image') as HTMLImageElement | null;
  const imageUrl = imgEl?.src || undefined;

  // MSRP
  const msrpEl = card.querySelector('.vehiclebox-msrp');
  const msrpText = msrpEl?.textContent || '';
  const msrp = parseInt(msrpText.replace(/[^0-9]/g, ''), 10) || undefined;

  // Selling price: element ID is `{vin-lowercase}-your-price`
  let price: number | undefined;
  if (vin) {
    const priceEl = card.querySelector(`[id="${vin.toLowerCase()}-your-price"]`);
    const priceText = priceEl?.textContent || '';
    price = parseInt(priceText.replace(/[^0-9]/g, ''), 10) || msrp;
  } else {
    price = msrp;
  }

  // Stock number
  const stockEl = card.querySelector('#copy_stock');
  const stockNumber = stockEl?.textContent?.trim() || undefined;

  // Detail link
  const linkEl = card.querySelector('a[href*="/viewdetails/"]') as HTMLAnchorElement | null;
  const link = linkEl?.href || undefined;

  // Highlight values
  const mileageText = getDetailValue(card, 'Mileage') || '';
  const mileage = parseInt(mileageText.replace(/[^0-9]/g, ''), 10) || undefined;
  const exteriorColor = getDetailValue(card, 'Exterior');
  const interiorColor = getDetailValue(card, 'Interior');

  const id = vin || stockNumber || titleText;
  if (!id) return null;

  return {
    id,
    title: titleText,
    year: parsed.year,
    make: parsed.make,
    model: parsed.model,
    trim: parsed.trim,
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

export const teamVelocityExtractor: DealerPlatformExtractor = {
  cardSelector: CARD_SELECTOR,

  extractAllListings(root: Document | Element): ExtractionResult<DealerListing> {
    const items: DealerListing[] = [];
    const errors: ExtractionError[] = [];

    // Get JSON-LD data as base
    const jsonLdMap = extractFromJsonLd(root);

    // Extract from DOM cards, enriching with JSON-LD
    const cards = root.querySelectorAll(CARD_SELECTOR);
    const seenVins = new Set<string>();

    cards.forEach((card, index) => {
      try {
        const listing = extractFromCard(card);
        if (!listing) return;

        // Merge with JSON-LD data if available
        if (listing.vin && jsonLdMap.has(listing.vin)) {
          const ld = jsonLdMap.get(listing.vin)!;
          // DOM data takes priority, JSON-LD fills gaps
          const merged: DealerListing = {
            ...listing,
            make: listing.make || ld.make,
            model: listing.model || ld.model,
            price: listing.price || ld.price,
            mileage: listing.mileage || ld.mileage,
            condition: listing.condition || ld.condition,
            exteriorColor: listing.exteriorColor || ld.exteriorColor,
            interiorColor: listing.interiorColor || ld.interiorColor,
            stockNumber: listing.stockNumber || ld.stockNumber,
          };
          items.push(merged);
          seenVins.add(listing.vin);
        } else {
          items.push(listing);
          if (listing.vin) seenVins.add(listing.vin);
        }
      } catch (e) {
        errors.push({ index, selector: CARD_SELECTOR, message: String(e) });
      }
    });

    // Add any JSON-LD items that weren't in the DOM
    for (const [vin, ld] of jsonLdMap) {
      if (!seenVins.has(vin) && ld.title) {
        items.push(ld as DealerListing);
      }
    }

    return { items, errors };
  },

  // Team Velocity uses server-side pagination — no client-side "load more"
};
