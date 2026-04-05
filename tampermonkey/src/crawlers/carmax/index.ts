import type { SiteCrawler } from '../index.js';
import { extractAllListings } from './extractors.js';

function sendToServer(
  taskId: string,
  site: string,
  itemKey: string | null,
  payload: any,
): Promise<void> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'POST',
      url: 'http://localhost:4242/api/collect',
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ site, taskId, itemKey, payload }),
      onload: (response) => {
        if (response.status >= 200 && response.status < 300) resolve();
        else reject(new Error(`Server returned ${response.status}`));
      },
      onerror: (err) => reject(err),
    });
  });
}

export const carmaxCrawler: SiteCrawler = {
  name: 'carmax',
  match: (url) => url.includes('carmax.com/cars'),
  run: async (task, progress) => {
    progress.info('Starting CarMax crawl');

    // Wait for results to load
    await new Promise((r) => setTimeout(r, 3000));

    const { items, errors } = extractAllListings(document);

    progress.setFound(items.length);

    for (const err of errors) {
      progress.warn(`Extraction error at index ${err.index}: ${err.message}`);
    }

    if (items.length === 0) {
      progress.warn('No listings found on page');
      return;
    }

    const timestamp = new Date().toISOString();
    let savedCount = 0;

    for (const listing of items) {
      const payload = { ...listing, timestamp };
      try {
        await sendToServer(task.id, 'carmax', listing.vin, payload);
        savedCount++;
        progress.itemSaved();
      } catch (err) {
        progress.itemError(`Failed to save listing ${listing.vin}: ${err}`);
      }
    }

    progress.info(`Crawl complete. Saved ${savedCount} of ${items.length} listings.`);
  },
};
