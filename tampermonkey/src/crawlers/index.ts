import type { CrawlProgress } from '../lib/progress.js';
import type { Task, TaskConfig } from '../lib/types.js';

export interface SiteCrawler {
  name: string;
  /** Domain this crawler operates on (e.g. "linkedin.com") */
  domain: string;
  /** Does this URL match a page where the crawler can actually run? */
  match: (url: string) => boolean;
  run: (task: Task, config: TaskConfig, progress: CrawlProgress) => Promise<void>;
}

import { carmaxCrawler } from './carmax/index.js';
import { carvanaCrawler } from './carvana/index.js';
import { linkedinCrawler } from './linkedin/index.js';

export const crawlers: SiteCrawler[] = [carmaxCrawler, carvanaCrawler, linkedinCrawler];
