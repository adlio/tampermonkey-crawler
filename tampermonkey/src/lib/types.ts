export interface Task {
  id: string;
  site: string;
  name: string;
  targetUrl: string | null;
  status: string;
  config: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskConfig {
  taskName?: string;
  strategy?: string;
  runMode?: string;
  recrawlIntervalHours?: number;
  lastSavedItemKey?: string;
  [key: string]: unknown;
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
