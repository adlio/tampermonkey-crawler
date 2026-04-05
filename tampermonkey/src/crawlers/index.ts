import type { CrawlProgress } from '../lib/progress.js';

export interface SiteCrawler {
  name: string;
  match: (url: string) => boolean;
  run: (task: any, progress: CrawlProgress) => Promise<void>;
}

import { carmaxCrawler } from './carmax/index.js';
import { linkedinCrawler } from './linkedin/index.js';

export const crawlers: SiteCrawler[] = [
  carmaxCrawler,
  linkedinCrawler,
  // Add more here
];
