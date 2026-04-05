export interface ExtractionResult<T> {
  items: T[];
  errors: ExtractionError[];
}

export interface ExtractionError {
  index: number;
  selector: string;
  message: string;
}
