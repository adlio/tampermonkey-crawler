/** Data extracted from a Toyota search results listing card via DOM. */
export interface ToyotaRawListing {
  vin: string;
  title: string;
  year: string | null;
  make: string;
  model: string | null;
  trim: string | null;
  price: string | null;
  priceNumeric: number | null;
  dealerText: string | null;
  tags: string | null;
  matchStatus: string | null;
  isSmartPath: boolean;
  buildPhase: string | null;
  link: string | null;
  imageUrl: string | null;
}

/** Pricing data from React fiber vehicle object. */
export interface ToyotaPriceData {
  advertizedPrice: number | null;
  nonSpAdvertizedPrice: number | null;
  totalMsrp: number | null;
  sellingPrice: number | null;
  dph: number | null;
  dioTotalMsrp: number | null;
  dioTotalDealerSellingPrice: number | null;
  dealerCashApplied: number | null;
  baseMsrp: number | null;
}

/** Dealer data from React fiber vehicle object. */
export interface ToyotaDealerData {
  code: string | null;
  name: string | null;
  distance: number | null;
  isPMA: boolean;
  isSmartPath: boolean;
  dealerSiteURL: string | null;
}

/** Color data from React fiber vehicle object. */
export interface ToyotaColorData {
  value: string | null;
  label: string | null;
  hex: string | null;
  code: string | null;
  colorFamilies: string[];
}

/** Interior color data from React fiber vehicle object. */
export interface ToyotaIntColorData {
  value: string | null;
  label: string | null;
  code: string | null;
}

/** Full vehicle data parsed from the React fiber. */
export interface ToyotaVehicleData {
  vin: string;
  name: string | null;
  marketingSeries: string | null;
  year: string | null;
  model: string | null;
  trim: string | null;
  trimCode: string | null;
  stockNum: string | null;
  mileage: number | null;
  description: string | null;
  isElectric: boolean;
  isPreSold: boolean;
  isSmartPath: boolean;
  engine: string | null;
  engineCode: string | null;
  fuelType: string | null;
  fuelTypeCode: string | null;
  drivetrain: string | null;
  drivetrainCode: string | null;
  baseMsrp: number | null;
  msrp: number | null;
  price: number | null;
  priceData: ToyotaPriceData | null;
  dealer: ToyotaDealerData | null;
  extColor: ToyotaColorData | null;
  intColor: ToyotaIntColorData | null;
  imageUrl: string | null;
  estMpg: string | null;
  category: string[];
  inventoryStatus: string | null;
  href: string | null;
  vdpUrl: string | null;
  options: string[];
}

/** Combined final payload sent to server. */
export interface ToyotaVehiclePayload extends ToyotaRawListing {
  name: string | null;
  marketingSeries: string | null;
  trimCode: string | null;
  stockNum: string | null;
  mileage: number | null;
  description: string | null;
  isElectric: boolean;
  isPreSold: boolean;
  engine: string | null;
  engineCode: string | null;
  fuelType: string | null;
  fuelTypeCode: string | null;
  drivetrain: string | null;
  drivetrainCode: string | null;
  baseMsrp: number | null;
  msrp: number | null;
  priceData: ToyotaPriceData | null;
  dealerData: ToyotaDealerData | null;
  extColor: ToyotaColorData | null;
  intColor: ToyotaIntColorData | null;
  estMpg: string | null;
  category: string[];
  inventoryStatus: string | null;
  vdpUrl: string | null;
  options: string[];
  images: { url: string; name: string; data: string }[];
  timestamp: string;
}

/** Vehicle data from the Toyota Certified REST API. */
export interface ToyotaCPOVehicle {
  vin: string;
  stockNumber: string | null;
  year: number;
  marketingSeries: string | null;
  model: string | null;
  modelName: string | null;
  modelYear: string | null;
  marketingTitle: string | null;
  grade: string | null;
  mileage: number | null;
  certificationType: string | null;
  certificationStatus: string | null;
  bodyStyle: string | null;
  brand: string;
  isPreviousRental: boolean;
  dealerCode: string | null;
  dealerName: string | null;
  vehicleComments: string | null;
  engineName: string | null;
  horsePower: number | null;
  fuelType: string | null;
  cylinders: string | null;
  transmission: string | null;
  drivetrain: string | null;
  drivetrainCode: string | null;
  sellingPrice: number | null;
  baseMsrp: number | null;
  totalMsrp: number | null;
  advertizedPrice: number | null;
  extColorName: string | null;
  extColorHex: string | null;
  intColorName: string | null;
  mpgCity: number | null;
  mpgHighway: number | null;
  mpgCombined: number | null;
  imageUrls: string[];
  options: string[];
  carfaxOneOwner: boolean;
  carfaxNoAccidents: boolean;
  carfaxPersonalUse: boolean;
}

/** CPO payload sent to server. */
export interface ToyotaCPOPayload extends ToyotaCPOVehicle {
  images: { url: string; name: string; data: string }[];
  timestamp: string;
}

export type { ExtractionResult, ExtractionError } from '../../lib/types.js';
