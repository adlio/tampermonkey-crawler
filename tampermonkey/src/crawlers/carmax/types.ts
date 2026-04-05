export interface CarMaxRawListing {
  title: string | null;
  price: string | null;
  mileage: string | null;
  link: string | null;
  vin: string | null;
}

export type { ExtractionResult, ExtractionError } from '../../lib/types.js';
