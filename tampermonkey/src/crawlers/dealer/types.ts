import type { ExtractionError, ExtractionResult } from '../../lib/types.js';
import type { DealerPlatform } from './detect.js';

export interface DealerListing {
  id: string;
  title: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  price?: number;
  mileage?: number;
  vin?: string;
  stockNumber?: string;
  condition?: string;
  imageUrl?: string;
  link?: string;
  exteriorColor?: string;
  interiorColor?: string;
  mpgCity?: number;
  mpgHwy?: number;
  engine?: string;
  fuelType?: string;
  bodyStyle?: string;
}

export interface DealerVehiclePayload extends DealerListing {
  images: { url: string; name: string; data: string }[];
  timestamp: string;
  platform: DealerPlatform;
}

export interface DealerPlatformExtractor {
  cardSelector: string;
  extractAllListings(root: Document | Element): ExtractionResult<DealerListing>;
  loadMore?(): Promise<boolean>;
}

/** Parse "2025 Toyota Camry LE" into structured fields. Strips leading condition prefixes. */
export function parseVehicleTitle(text: string): {
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
} {
  const cleaned = text.replace(/^(new|used|certified)\s+/i, '').trim();
  const match = cleaned.match(/^(\d{4})\s+([\w-]+)\s+(\S+)(?:\s+(.+))?$/);
  if (!match) return {};
  return {
    year: parseInt(match[1], 10),
    make: match[2],
    model: match[3],
    trim: match[4] || undefined,
  };
}

/** Shared card extraction loop with per-card error handling. */
export function extractCards<T>(
  root: Document | Element,
  selector: string,
  extractFn: (card: Element) => T | null,
): ExtractionResult<T> {
  const items: T[] = [];
  const errors: ExtractionError[] = [];
  const cards = root.querySelectorAll(selector);

  cards.forEach((card, index) => {
    try {
      const item = extractFn(card);
      if (item) items.push(item);
    } catch (e) {
      errors.push({ index, selector, message: String(e) });
    }
  });

  return { items, errors };
}
