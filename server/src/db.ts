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
`);

export default db;
