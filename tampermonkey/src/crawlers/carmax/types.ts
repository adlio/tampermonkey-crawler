/** Data extracted from the search results listing card. */
export interface CarMaxRawListing {
  stockNumber: string;
  title: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  price: string | null;
  priceNumeric: number | null;
  mileage: string | null;
  link: string | null;
  imageUrl: string | null;
  location: string | null;
  shippingCost: string | null;
  monthlyEstimate: string | null;
  isReserved: boolean;
  isComingSoon: boolean;
  isMarkedDown: boolean;
}

/** Spec extracted from the detail page overview section. */
export interface VehicleSpec {
  label: string;
  value: string;
}

/** Image metadata from the CarMax image API. */
export interface VehicleImage {
  name: string;
  type: string;
  category: string | null;
  thumbnailUrl: string;
  fullSizeUrl: string;
}

/** Combined data from listing + detail page + APIs. */
export interface CarMaxVehiclePayload extends CarMaxRawListing {
  vin: string | null;
  specs: VehicleSpec[];
  features: string[];
  imageManifest: VehicleImage[];
  images: { url: string; name: string; data: string }[];
  timestamp: string;
}

export type { ExtractionResult, ExtractionError } from '../../lib/types.js';
