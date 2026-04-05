export interface SiteCrawler {
  match: (url: string) => boolean;
  run: (task: any) => Promise<void>;
}

import { carmaxCrawler } from './carmax.js';
import { linkedinCrawler } from './linkedin.js';

export const crawlers: SiteCrawler[] = [
  carmaxCrawler,
  linkedinCrawler,
  // Add more here
];
