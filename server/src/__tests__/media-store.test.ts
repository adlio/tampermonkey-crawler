import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { slugify, parsePostDate, MediaStore } from '../media-store.js';
import { parseMpdSegments } from '../ffmpeg.js';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('slugify', () => {
  it('lowercases and replaces non-alphanumeric chars', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
  });

  it('truncates to maxLen', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long, 50).length).toBeLessThanOrEqual(50);
  });

  it('strips leading/trailing dashes', () => {
    expect(slugify('---hello---')).toBe('hello');
  });

  it('handles empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('collapses multiple dashes', () => {
    expect(slugify('one   two   three')).toBe('one-two-three');
  });

  it('handles unicode', () => {
    expect(slugify('café résumé')).toBe('caf-r-sum');
  });
});

describe('parsePostDate', () => {
  const now = new Date('2024-06-15T12:00:00.000Z');

  it('parses ISO date strings', () => {
    const result = parsePostDate('2024-03-10T08:30:00.000Z', now);
    expect(result.toISOString()).toBe('2024-03-10T08:30:00.000Z');
  });

  it('parses relative days', () => {
    const result = parsePostDate('5d', now);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(5); // June (0-indexed)
    expect(result.getDate()).toBe(10);
  });

  it('parses relative weeks', () => {
    const result = parsePostDate('2w', now);
    const expected = new Date(now.getTime() - 14 * 24 * 3600_000);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it('parses relative hours', () => {
    const result = parsePostDate('3h', now);
    const expected = new Date(now.getTime() - 3 * 3600_000);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it('parses relative months', () => {
    const result = parsePostDate('1mo', now);
    const expected = new Date(now.getTime() - 30 * 24 * 3600_000);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it('falls back to now for unparseable input', () => {
    const result = parsePostDate('garbage', now);
    expect(result.getTime()).toBe(now.getTime());
  });

  it('falls back to now for empty input', () => {
    const result = parsePostDate('', now);
    expect(result.getTime()).toBe(now.getTime());
  });
});

describe('MediaStore', () => {
  let tmpDir: string;
  let store: MediaStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ms-test-'));
    store = new MediaStore(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates structured media paths', () => {
    const path = store.mediaPath(
      {
        site: 'linkedin',
        identifier: 'simonwardley',
        postDate: '2024-03-15T10:00:00.000Z',
        postText: 'Hello world post about mapping',
        itemKey: 'urn:li:activity:123',
      },
      'image1',
      'png',
    );

    expect(path).toBe(
      'linkedin/simonwardley/2024/2024-03/2024-03-15-hello-world-post-about-mapping-image1.png',
    );
  });

  it('falls back to itemKey slug when text is empty', () => {
    const path = store.mediaPath(
      {
        site: 'linkedin',
        identifier: 'jdoe',
        postDate: '2024-01-01T00:00:00.000Z',
        postText: '',
        itemKey: 'urn:li:activity:456',
      },
      'image',
      'jpg',
    );

    expect(path).toContain('urn-li-activity-456');
  });

  it('writes and reads files', () => {
    const data = Buffer.from('hello');
    const relPath = store.mediaPath(
      {
        site: 'test',
        identifier: 'user',
        postDate: '2024-06-01T00:00:00.000Z',
        postText: 'test post',
        itemKey: 'key-1',
      },
      'file',
      'txt',
    );

    store.write(relPath, data);

    expect(existsSync(join(tmpDir, relPath))).toBe(true);
    expect(store.read(relPath)?.toString()).toBe('hello');
  });

  it('returns null for missing files', () => {
    expect(store.read('nonexistent/path.txt')).toBeNull();
  });

  it('handles relative dates in paths', () => {
    const now = new Date('2024-06-15T12:00:00.000Z');
    // parsePostDate is used internally — test via mediaPath behavior
    const path = store.mediaPath(
      {
        site: 'linkedin',
        identifier: 'test',
        postDate: '5d',
        postText: 'recent post',
        itemKey: 'key',
      },
      'image',
      'jpg',
    );

    // Should contain a valid date path, not NaN
    expect(path).toMatch(/linkedin\/test\/\d{4}\/\d{4}-\d{2}\/\d{4}-\d{2}-\d{2}/);
  });
});

describe('parseMpdSegments', () => {
  it('extracts init and segment URLs from a SegmentList MPD', () => {
    const mpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT10S">
  <Period>
    <AdaptationSet contentType="video" codecs="av01.0.04M.10">
      <Representation bandwidth="500000" width="640" height="360" mimeType="video/iso.segment">
        <SegmentList duration="4">
          <Initialization sourceURL="https://cdn.example.com/init-360.mp4"/>
          <SegmentURL media="https://cdn.example.com/seg-360-1.m4s"/>
          <SegmentURL media="https://cdn.example.com/seg-360-2.m4s"/>
        </SegmentList>
      </Representation>
      <Representation bandwidth="1500000" width="1280" height="720" mimeType="video/iso.segment">
        <SegmentList duration="4">
          <Initialization sourceURL="https://cdn.example.com/init-720.mp4"/>
          <SegmentURL media="https://cdn.example.com/seg-720-1.m4s"/>
          <SegmentURL media="https://cdn.example.com/seg-720-2.m4s"/>
          <SegmentURL media="https://cdn.example.com/seg-720-3.m4s"/>
        </SegmentList>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const result = parseMpdSegments(mpd);
    expect(result).not.toBeNull();
    expect(result!.initUrl).toBe('https://cdn.example.com/init-720.mp4');
    expect(result!.segmentUrls).toEqual([
      'https://cdn.example.com/seg-720-1.m4s',
      'https://cdn.example.com/seg-720-2.m4s',
      'https://cdn.example.com/seg-720-3.m4s',
    ]);
  });

  it('picks the highest bandwidth representation', () => {
    const mpd = `<MPD>
  <Period>
    <AdaptationSet>
      <Representation bandwidth="3000000" width="1920" height="1080">
        <SegmentList><Initialization sourceURL="https://x/init-1080"/><SegmentURL media="https://x/s1"/></SegmentList>
      </Representation>
      <Representation bandwidth="800000" width="854" height="480">
        <SegmentList><Initialization sourceURL="https://x/init-480"/><SegmentURL media="https://x/s2"/></SegmentList>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const result = parseMpdSegments(mpd);
    expect(result!.initUrl).toBe('https://x/init-1080');
    expect(result!.segmentUrls).toEqual(['https://x/s1']);
  });

  it('returns null for non-MPD content', () => {
    expect(parseMpdSegments('<html><body>Not a manifest</body></html>')).toBeNull();
  });

  it('returns null when no Initialization element exists', () => {
    const mpd = `<MPD><Period><AdaptationSet>
      <Representation bandwidth="1000">
        <SegmentList><SegmentURL media="https://x/s1"/></SegmentList>
      </Representation>
    </AdaptationSet></Period></MPD>`;
    expect(parseMpdSegments(mpd)).toBeNull();
  });

  it('returns null when no SegmentURL elements exist', () => {
    const mpd = `<MPD><Period><AdaptationSet>
      <Representation bandwidth="1000">
        <SegmentList><Initialization sourceURL="https://x/init"/></SegmentList>
      </Representation>
    </AdaptationSet></Period></MPD>`;
    expect(parseMpdSegments(mpd)).toBeNull();
  });

  it('decodes XML entities in URLs', () => {
    const mpd = `<MPD><Period><AdaptationSet>
      <Representation bandwidth="1000" width="1280" height="720">
        <SegmentList>
          <Initialization sourceURL="https://cdn.example.com/init?e=123&amp;v=beta&amp;t=abc"/>
          <SegmentURL media="https://cdn.example.com/seg1?e=123&amp;v=beta&amp;t=xyz"/>
        </SegmentList>
      </Representation>
    </AdaptationSet></Period></MPD>`;

    const result = parseMpdSegments(mpd);
    expect(result!.initUrl).toBe('https://cdn.example.com/init?e=123&v=beta&t=abc');
    expect(result!.segmentUrls[0]).toBe('https://cdn.example.com/seg1?e=123&v=beta&t=xyz');
  });
});
