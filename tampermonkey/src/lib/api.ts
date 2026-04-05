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
      onerror: (err) => reject(err),
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
      onerror: (err) => reject(err),
    });
  });
}
