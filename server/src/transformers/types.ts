export interface NormalizedCarListing {
  vin: string | null;
  sourceUrl: string;
  sourceSite: string;
  sourceListingId: string | null;
  year: number | null;
  make: string;
  model: string;
  trim: string | null;
  bodyStyle: string | null;
  drivetrain: string | null;
  transmission: string | null;
  engine: string | null;
  fuelType: string | null;
  mileage: number | null;
  condition: string | null;
  price: number | null; // cents
  priceCurrency: string;
  priceLabel: string | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  imageUrls: string[];
  thumbnailUrl: string | null;
  crawledAt: string;
  rawCrawlId: number;
}

export interface TransformResult<T> {
  success: T[];
  errors: Array<{ rawCrawlId: number; message: string }>;
}
