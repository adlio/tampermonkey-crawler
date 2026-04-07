/** Data extracted from a Lexus search results listing card via DOM selectors. */
export interface LexusRawListing {
  vin: string;
  title: string;
  price: string | null;
  dealer: string | null;
  tags: string | null;
  isMonogram: boolean;
  imageUrl: string | null;
}

/** Vehicle data parsed from the React fiber state on the list page. */
export interface LexusVehicleData {
  vin: string;
  name: string;
  marketingSeries: string;
  year: string;
  model: string;
  trim: { value: string; code: string } | null;
  stockNum: string | null;
  mileage: number | null;
  description: string | null;
  isElectric: boolean;
  isPreSold: boolean;
  isSmartPath: boolean;
  engine: { value: string; code: string } | null;
  fuelType: { code: string; value: string } | null;
  drivetrain: { value: string; code: string } | null;
  baseMsrp: number | null;
  msrp: number | null;
  price: number | null;
  priceData: {
    advertizedPrice: number | null;
    nonSpAdvertizedPrice: number | null;
    totalMsrp: number | null;
    sellingPrice: number | null;
    dph: number | null;
    dioTotalMsrp: number | null;
    dioTotalDealerSellingPrice: number | null;
    dealerCashApplied: number | null;
    baseMsrp: number | null;
  } | null;
  dealer: {
    value: string;
    code: string;
    name: string;
    distance: number | null;
    isPMA: boolean;
    isSmartPath: boolean;
    dealerSiteURL: string | null;
  } | null;
  extColor: {
    value: string;
    label: string;
    hex: string | null;
    code: string;
    colorFamilies: string[];
  } | null;
  intColor: {
    value: string;
    label: string;
    code: string;
  } | null;
  jelly: {
    image: {
      desktop: { src: string } | null;
    } | null;
  } | null;
  estMpg: string | null;
  modelData: {
    modelCd: string;
    marketingName: string;
    marketingTitle: string;
  } | null;
  category: string[];
  inventoryStatus: string | null;
  href: string | false;
  vdpUrl: string | null;
  options: { optionCd: string; marketingName: string }[];
}

/** Combined final payload sent to the server. */
export interface LexusVehiclePayload {
  vin: string;
  name: string;
  marketingSeries: string;
  year: string;
  model: string;
  trim: string | null;
  trimCode: string | null;
  stockNum: string | null;
  mileage: number | null;
  description: string | null;
  isElectric: boolean;
  isPreSold: boolean;
  isMonogram: boolean;
  engine: string | null;
  fuelType: string | null;
  drivetrain: string | null;
  baseMsrp: number | null;
  msrp: number | null;
  price: number | null;
  priceData: LexusVehicleData['priceData'];
  dealerName: string | null;
  dealerCode: string | null;
  dealerDistance: number | null;
  dealerSiteURL: string | null;
  extColor: string | null;
  extColorCode: string | null;
  intColor: string | null;
  intColorCode: string | null;
  estMpg: string | null;
  modelCode: string | null;
  marketingName: string | null;
  marketingTitle: string | null;
  category: string[];
  inventoryStatus: string | null;
  vdpUrl: string | null;
  options: { optionCd: string; marketingName: string }[];
  images: { url: string; name: string; data: string }[];
  timestamp: string;
}

/** Data extracted from an L/Certified listing card via DOM selectors. */
export interface LexusCPOListing {
  vin: string;
  year: number | null;
  model: string | null;
  trim: string | null;
  mileage: number | null;
  price: number | null;
  dealer: string | null;
  detailUrl: string | null;
  imageUrl: string | null;
}

/** CPO payload sent to server. */
export interface LexusCPOPayload extends LexusCPOListing {
  images: { url: string; name: string; data: string }[];
  timestamp: string;
}

export type { ExtractionResult, ExtractionError } from '../../lib/types.js';
