import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const SCHEMA = `
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

  -- Raw crawl storage: site-specific JSON
  CREATE TABLE IF NOT EXISTS raw_crawls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taskId TEXT NOT NULL,
    site TEXT NOT NULL,
    itemKey TEXT,
    payload TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_raw_crawls_task ON raw_crawls(taskId);
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

  -- Content-addressed blob storage
  CREATE TABLE IF NOT EXISTS blobs (
    hash TEXT PRIMARY KEY,
    data BLOB NOT NULL,
    mimeType TEXT NOT NULL DEFAULT 'application/octet-stream',
    size INTEGER NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS raw_crawl_blobs (
    rawCrawlId INTEGER NOT NULL,
    blobHash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'content-image',
    PRIMARY KEY (rawCrawlId, blobHash, name)
  );
  CREATE INDEX IF NOT EXISTS idx_raw_crawl_blobs_hash ON raw_crawl_blobs(blobHash);
`;

export function initSchema(db: Database.Database): void {
  db.exec(SCHEMA);
}

export function createDatabase(path?: string): Database.Database {
  const db = new Database(path ?? ':memory:');
  initSchema(db);
  return db;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || resolve(__dirname, '../../crawler.db');
const db = createDatabase(dbPath);

export default db;
