import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, '../../crawler.db');
const db = new Database(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    site TEXT NOT NULL,
    name TEXT NOT NULL,
    targetUrl TEXT,
    status TEXT DEFAULT 'pending', -- pending, running, completed, failed
    config TEXT, -- JSON string
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site TEXT NOT NULL,
    payload TEXT NOT NULL, -- JSON string
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Raw crawl storage: site-specific JSON before transformation
  CREATE TABLE IF NOT EXISTS raw_crawls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taskId TEXT NOT NULL,
    site TEXT NOT NULL,
    itemKey TEXT,
    payload TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, transformed, failed
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    transformedAt DATETIME
  );
  CREATE INDEX IF NOT EXISTS idx_raw_crawls_task ON raw_crawls(taskId);
  CREATE INDEX IF NOT EXISTS idx_raw_crawls_status ON raw_crawls(status);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_crawls_dedup ON raw_crawls(taskId, itemKey);

  -- Progress/event log for crawl sessions
  CREATE TABLE IF NOT EXISTS crawl_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taskId TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    data TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_crawl_logs_task ON crawl_logs(taskId);

  -- Normalized car listings
  CREATE TABLE IF NOT EXISTS car_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rawCrawlId INTEGER,
    taskId TEXT NOT NULL,
    vin TEXT,
    sourceUrl TEXT,
    sourceSite TEXT NOT NULL,
    sourceListingId TEXT,
    year INTEGER,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    trim TEXT,
    bodyStyle TEXT,
    drivetrain TEXT,
    transmission TEXT,
    engine TEXT,
    fuelType TEXT,
    mileage INTEGER,
    condition TEXT,
    price INTEGER,
    priceCurrency TEXT DEFAULT 'USD',
    priceLabel TEXT,
    exteriorColor TEXT,
    interiorColor TEXT,
    imageUrls TEXT,
    thumbnailUrl TEXT,
    crawledAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_car_listings_vin_site
    ON car_listings(vin, sourceSite);
`);

export default db;
