/** Data extracted from the search results listing card. */
export interface CarvanaRawListing {
  vehicleId: string;
  title: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  price: string | null;
  priceNumeric: number | null;
  originalPrice: string | null;
  mileage: string | null;
  link: string | null;
  imageUrl: string | null;
  monthlyPayment: string | null;
  downPayment: string | null;
  shippingCost: string | null;
  isFreeShipping: boolean;
  deliveryEstimate: string | null;
  isPriceDrop: boolean;
  isGreatDeal: boolean;
  /** Card-level status: "Purchase in progress", "Pre-order now", "Recent", or null */
  statusTag: string | null;
  /** Battery pack size parsed from trim: "Standard", "Large", "Max", or null */
  batteryPack: string | null;
}

/** Spec extracted from the detail page __NEXT_DATA__. */
export interface VehicleSpec {
  label: string;
  value: string;
}

/**
 * Image metadata from the detail page __NEXT_DATA__.
 * Carvana provides a single URL per image (unlike CarMax which has
 * separate thumbnailUrl/fullSizeUrl from a dedicated image API).
 */
export interface VehicleImage {
  name: string;
  category: string;
  imageUrl: string;
}

/** Feature from the detail page. */
export interface VehicleFeature {
  title: string;
  location: string;
  imageUrl: string | null;
}

/** Vehicle details parsed from the detail page __NEXT_DATA__. */
export interface CarvanaVehicleDetails {
  vehicleId: number;
  stockNumber: number | null;
  vin: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  price: number | null;
  mileage: number | null;
  bodyType: string | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  drivetrain: string | null;
  engine: string | null;
  transmission: string | null;
  fuelType: string | null;
  horsepower: number | null;
  evRange: number | null;
  seating: number | null;
  doors: number | null;
  saleStatus: string | null;
  location: { city: string; state: string } | null;
  specs: VehicleSpec[];
  features: VehicleFeature[];
  imageManifest: VehicleImage[];
  highlights: string[];
}

/** Combined data from listing + detail page. */
export interface CarvanaVehiclePayload extends CarvanaRawListing {
  vin: string | null;
  stockNumber: number | null;
  bodyType: string | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  drivetrain: string | null;
  engine: string | null;
  transmission: string | null;
  fuelType: string | null;
  horsepower: number | null;
  evRange: number | null;
  seating: number | null;
  doors: number | null;
  saleStatus: string | null;
  locationCity: string | null;
  locationState: string | null;
  specs: VehicleSpec[];
  features: VehicleFeature[];
  imageManifest: VehicleImage[];
  images: { url: string; name: string; data: string }[];
  timestamp: string;
}

export type { ExtractionResult, ExtractionError } from '../../lib/types.js';
