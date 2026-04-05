import type { CrawlProgress } from '../lib/progress.js';

export interface SiteCrawler {
  name: string;
  match: (url: string) => boolean;
  run: (task: any, progress: CrawlProgress) => Promise<void>;
}

import { carmaxCrawler } from './carmax.js';
import { linkedinCrawler } from './linkedin.js';

export const crawlers: SiteCrawler[] = [
  carmaxCrawler,
  linkedinCrawler,
  // Add more here
];
