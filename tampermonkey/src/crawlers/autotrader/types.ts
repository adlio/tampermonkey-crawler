/** Data extracted from the search results listing card. */
export interface AutoTraderRawListing {
  listingId: string;
  title: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  price: number | null;
  mileage: string | null;
  link: string | null;
  imageUrl: string | null;
  condition: string | null;
  fuelType: string | null;
  dealerName: string | null;
  dealerDistance: string | null;
  isPriceDrop: boolean;
  isNewlyListed: boolean;
  /** VHR badge text, e.g. "No Accidents" */
  vhrBadge: string | null;
}

/** Spec extracted from the detail page __NEXT_DATA__. */
export interface VehicleSpec {
  label: string;
  value: string;
}

/** Image metadata from __NEXT_DATA__. */
export interface VehicleImage {
  name: string;
  src: string;
  width: number | null;
  height: number | null;
}

/** EV-specific data from __NEXT_DATA__ electricComponentInfo. */
export interface ElectricInfo {
  batteryRange: number | null;
  batteryType: string | null;
  batteryCapacity: number | null;
  batteryEnergyCapacity: number | null;
  batteryEfficiencyCity: number | null;
  batteryEfficiencyHighway: number | null;
  batteryEfficiencyCombined: number | null;
  batteryMaximumChargeRate: number | null;
  chargingLevelMax: string | null;
  chargingPortSide: string | null;
  connectorTypes: string | null;
  electricMotorCount: number | null;
  epaChargeTimeAt240V: number | null;
}

/** Vehicle details parsed from detail page __NEXT_DATA__. */
export interface AutoTraderVehicleDetails {
  listingId: number;
  vin: string | null;
  stockId: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  title: string;
  listingType: string | null;
  price: number | null;
  mileage: string | null;
  bodyStyle: string | null;
  exteriorColor: string | null;
  exteriorColorSimple: string | null;
  interiorColor: string | null;
  driveType: string | null;
  engine: string | null;
  fuelType: string | null;
  transmission: string | null;
  doors: string | null;
  electricVehicleRange: number | null;
  electricInfo: ElectricInfo | null;
  isReducedPrice: boolean;
  isNewlyListed: boolean;
  isHot: boolean;
  daysOnSite: number | null;
  ownerName: string | null;
  vhrPreview: string[];
  pricingHistory: { dateUpdated: string; price: string }[];
  specs: VehicleSpec[];
  imageManifest: VehicleImage[];
}

/** Combined data from listing card + detail page. */
export interface AutoTraderVehiclePayload extends AutoTraderRawListing {
  vin: string | null;
  stockId: string | null;
  listingType: string | null;
  bodyStyle: string | null;
  exteriorColor: string | null;
  exteriorColorSimple: string | null;
  interiorColor: string | null;
  driveType: string | null;
  engine: string | null;
  transmission: string | null;
  doors: string | null;
  electricVehicleRange: number | null;
  electricInfo: ElectricInfo | null;
  isHot: boolean;
  daysOnSite: number | null;
  ownerName: string | null;
  vhrPreview: string[];
  pricingHistory: { dateUpdated: string; price: string }[];
  specs: VehicleSpec[];
  imageManifest: VehicleImage[];
  images: { url: string; name: string; data: string }[];
  timestamp: string;
}

export type { ExtractionResult, ExtractionError } from '../../lib/types.js';
