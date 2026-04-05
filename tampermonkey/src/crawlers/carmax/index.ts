import type { SiteCrawler } from '../index.js';
import { sendToServer } from '../../lib/api.js';
import { extractAllListings, matchesCarMax } from './extractors.js';

export const carmaxCrawler: SiteCrawler = {
  name: 'carmax',
  match: matchesCarMax,
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
