import type { Task } from './types.js';

export const BACKEND_URL = 'http://localhost:4242';

export function sendToServer(
  taskId: string,
  site: string,
  itemKey: string | null,
  payload: any,
): Promise<void> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'POST',
      url: `${BACKEND_URL}/api/collect`,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ site, taskId, itemKey, payload }),
      onload: (response) => {
        if (response.status >= 200 && response.status < 300) resolve();
        else reject(new Error(`Server returned ${response.status}: ${response.responseText}`));
      },
      onerror: (err) => reject(new Error(`Network error: ${JSON.stringify(err)}`)),
    });
  });
}

export function updateTaskConfig(taskId: string, updates: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'POST',
      url: `${BACKEND_URL}/api/tasks/${taskId}/config`,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify(updates),
      onload: () => resolve(),
      onerror: (err) => reject(new Error(`Network error: ${JSON.stringify(err)}`)),
    });
  });
}

export function fetchActionableTasks(): Promise<Task[]> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url: `${BACKEND_URL}/api/tasks/actionable`,
      onload: (response) => {
        try {
          resolve(JSON.parse(response.responseText));
        } catch (e) {
          reject(e);
        }
      },
      onerror: (err) => reject(new Error(`Network error: ${JSON.stringify(err)}`)),
    });
  });
}

export function updateTaskStatus(taskId: string, status: string): Promise<void> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'POST',
      url: `${BACKEND_URL}/api/tasks/${taskId}/status`,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ status }),
      onload: () => resolve(),
      onerror: (err) => reject(new Error(`Network error: ${JSON.stringify(err)}`)),
    });
  });
}
