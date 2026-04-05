export interface Task {
  id: string;
  site: string;
  name: string;
  targetUrl?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  config?: string; // JSON string
  createdAt?: string;
  updatedAt?: string;
}

export interface CollectedData {
  site: string;
  payload: any;
}

export interface RawCrawl {
  id: number;
  taskId: string;
  site: string;
  itemKey: string | null;
  payload: string; // JSON
  status: 'pending' | 'transformed' | 'failed';
  createdAt: string;
  transformedAt: string | null;
}

export interface CrawlLog {
  id: number;
  taskId: string;
  level: 'info' | 'warn' | 'error' | 'progress';
  message: string;
  data: string | null; // JSON
  createdAt: string;
}
