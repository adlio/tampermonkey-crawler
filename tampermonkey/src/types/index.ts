export interface Task {
  id: string;
  site: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  config?: string; // JSON string
  createdAt?: string;
  updatedAt?: string;
}

export interface CollectedData {
  site: string;
  payload: any;
}
