import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg', // last so EXT_BY_MIME prefers "jpg"
};

const EXT_BY_MIME = new Map(Object.entries(MIME_MAP).map(([ext, mime]) => [mime, ext.slice(1)]));

/** Get MIME type from a filename. Defaults to image/jpeg. */
export function mimeFromName(name: string | undefined): string {
  if (!name) return 'image/jpeg';
  const ext = extname(name).toLowerCase();
  return MIME_MAP[ext] || 'image/jpeg';
}

/** Get file extension (without dot) from a MIME type. Defaults to jpg. */
export function extFromMime(mime: string): string {
  return EXT_BY_MIME.get(mime) || 'jpg';
}

/**
 * Generate a URL-safe slug from text.
 * Keeps first ~50 chars, lowercased, non-alphanumeric replaced with dashes.
 */
export function slugify(text: string, maxLen = 50): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
    .replace(/-+$/, '');
}

/**
 * Parse a post date into a Date object.
 * Handles ISO strings and relative dates like "5d", "2w", "1mo", "3h".
 */
export function parsePostDate(postDate: string, now = new Date()): Date {
  // Try ISO parse first
  const iso = new Date(postDate);
  if (!isNaN(iso.getTime()) && postDate.length > 6) return iso;

  // Relative date patterns: "5d", "2w", "1mo", "3h", "15m"
  const match = postDate.match(/^(\d+)(mo|[smhdw])$/);
  if (match) {
    const amount = parseInt(match[1], 10);
    const unit = match[2];
    const ms = now.getTime();
    const hourMs = 3600_000;
    const dayMs = 24 * hourMs;
    switch (unit) {
      case 's':
        return new Date(ms - amount * 1000);
      case 'm':
        return new Date(ms - amount * 60_000);
      case 'h':
        return new Date(ms - amount * hourMs);
      case 'd':
        return new Date(ms - amount * dayMs);
      case 'w':
        return new Date(ms - amount * 7 * dayMs);
      case 'mo':
        return new Date(ms - amount * 30 * dayMs);
    }
  }

  return now;
}

export interface MediaPathInfo {
  site: string;
  identifier: string; // profileId, search slug, etc.
  postDate: string;
  postText: string;
  itemKey: string;
}

export class MediaStore {
  constructor(private dataDir: string) {}

  ensureDir(): void {
    mkdirSync(this.dataDir, { recursive: true });
  }

  /**
   * Build the directory path and filename prefix for media.
   *
   * When postDate is present (e.g. LinkedIn posts): date-based subdirs
   *   dir:    linkedin/simonwardley/2024/2024-01
   *   prefix: 2024-01-15-post-slug
   *
   * When postDate is absent (e.g. CarMax vehicles): flat by identifier
   *   dir:    carmax/7PDSGBBAXSN046004
   *   prefix: 28099103  (itemKey = stock number)
   */
  postPath(info: MediaPathInfo): { dir: string; prefix: string } {
    if (!info.postDate) {
      const dir = join(info.site, info.identifier);
      const prefix = slugify(info.itemKey) || info.identifier;
      return { dir, prefix };
    }

    const date = parsePostDate(info.postDate);
    const yyyy = date.getFullYear().toString();
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');

    const slug = slugify(info.postText) || slugify(info.itemKey) || 'post';
    const dir = join(info.site, info.identifier, yyyy, `${yyyy}-${mm}`);
    const prefix = `${yyyy}-${mm}-${dd}-${slug}`;
    return { dir, prefix };
  }

  /**
   * Build a relative file path for a media file attached to a post.
   * e.g. "linkedin/simonwardley/2024/2024-01/2024-01-15-post-slug-image1.png"
   */
  mediaPath(info: MediaPathInfo, mediaName: string, ext: string): string {
    const { dir, prefix } = this.postPath(info);
    return join(dir, `${prefix}-${mediaName}.${ext}`);
  }

  /** Write data to a relative path under the data directory. Returns the relative path. */
  write(relativePath: string, data: Buffer): string {
    const fullPath = join(this.dataDir, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, data);
    return relativePath;
  }

  /** Read a file by its relative path. */
  read(relativePath: string): Buffer | null {
    try {
      return readFileSync(join(this.dataDir, relativePath));
    } catch {
      return null;
    }
  }

  /** Get the absolute path for a relative path. */
  fullPath(relativePath: string): string {
    return join(this.dataDir, relativePath);
  }

  /** Ensure the parent directory exists for a relative path. */
  ensureDirFor(relativePath: string): void {
    mkdirSync(dirname(join(this.dataDir, relativePath)), { recursive: true });
  }

  /** Delete a file by its relative path. Silently ignores missing files. */
  delete(relativePath: string): void {
    try {
      unlinkSync(join(this.dataDir, relativePath));
    } catch {
      // File already gone — fine
    }
  }
}
