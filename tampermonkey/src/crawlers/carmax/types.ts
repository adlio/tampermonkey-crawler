export interface CarMaxRawListing {
  title: string | null;
  price: string | null;
  mileage: string | null;
  link: string | null;
  vin: string | null;
}

export interface ExtractionResult<T> {
  items: T[];
  errors: ExtractionError[];
}

export interface ExtractionError {
  index: number;
  selector: string;
  message: string;
}
