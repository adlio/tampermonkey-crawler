import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractPost, extractAllPosts, matchesLinkedIn } from '../linkedin.js';

let doc: Document;

beforeAll(() => {
  const html = readFileSync(
    resolve(__dirname, '../__fixtures__/linkedin-feed.html'),
    'utf-8',
  );
  // jsdom environment provides a global document; inject fixture into body
  document.body.innerHTML = html;
  doc = document;
});

describe('extractPost', () => {
  it('extracts postId from data-urn', () => {
    const post = doc.querySelector('[data-urn="urn:li:activity:7100000000000000001"]')!;
    const result = extractPost(post);
    expect(result).not.toBeNull();
    expect(result!.postId).toBe('urn:li:activity:7100000000000000001');
  });

  it('extracts author name', () => {
    const post = doc.querySelector('[data-urn="urn:li:activity:7100000000000000001"]')!;
    const result = extractPost(post)!;
    expect(result.author).toBe('Simon Wardley');
  });

  it('detects reposts and extracts repostedBy', () => {
    const post = doc.querySelector('[data-urn="urn:li:activity:7100000000000000002"]')!;
    const result = extractPost(post)!;
    expect(result.isRepost).toBe(true);
    expect(result.repostedBy).toBe('Simon Wardley');
    // The actual post author (not the reposter)
    expect(result.author).toBe('Another Author');
  });

  it('marks non-reposts correctly', () => {
    const post = doc.querySelector('[data-urn="urn:li:activity:7100000000000000001"]')!;
    const result = extractPost(post)!;
    expect(result.isRepost).toBe(false);
    expect(result.repostedBy).toBe('');
  });

  it('extracts text content', () => {
    const post = doc.querySelector('[data-urn="urn:li:activity:7100000000000000001"]')!;
    const result = extractPost(post)!;
    expect(result.text).toContain('Mapping is not about perfection');
    expect(result.text).toContain('understanding your landscape');
  });

  it('filters out profile photos and logos from imageUrls', () => {
    const post = doc.querySelector('[data-urn="urn:li:activity:7100000000000000001"]')!;
    const result = extractPost(post)!;
    // Should include the content image
    expect(result.imageUrls.length).toBe(1);
    expect(result.imageUrls[0]).toContain('content-photo-shrink');
    // Should NOT include profile-displayphoto or company-logo images
    for (const url of result.imageUrls) {
      expect(url).not.toContain('profile-displayphoto');
      expect(url).not.toContain('company-logo');
    }
  });

  it('returns empty imageUrls for posts without content images', () => {
    const post = doc.querySelector('[data-urn="urn:li:activity:7100000000000000003"]')!;
    const result = extractPost(post)!;
    expect(result.imageUrls).toEqual([]);
  });

  it('extracts canonical post URL from permalink', () => {
    const post = doc.querySelector('[data-urn="urn:li:activity:7100000000000000001"]')!;
    const result = extractPost(post)!;
    expect(result.postUrl).toContain('/feed/update/urn:li:activity:7100000000000000001');
  });

  it('extracts full absolute URL when permalink has full href', () => {
    const post = doc.querySelector('[data-urn="urn:li:activity:7100000000000000003"]')!;
    const result = extractPost(post)!;
    expect(result.postUrl).toContain('linkedin.com/feed/update/urn:li:activity:7100000000000000003');
  });

  it('extracts date from time element', () => {
    const post = doc.querySelector('[data-urn="urn:li:activity:7100000000000000001"]')!;
    const result = extractPost(post)!;
    expect(result.postDate).toBe('2025-12-15T10:30:00.000Z');
  });

  it('generates title from first line of text', () => {
    const post = doc.querySelector('[data-urn="urn:li:activity:7100000000000000001"]')!;
    const result = extractPost(post)!;
    expect(result.title).toBe('Mapping is not about perfection, it is about understanding your landscape.');
    expect(result.title.length).toBeLessThanOrEqual(100);
  });

  it('returns null for a post without data-urn or id', () => {
    // The 4th post in the fixture has no data-urn
    const posts = doc.querySelectorAll('.feed-shared-update-v2');
    const malformed = posts[3]; // 0-indexed, the 4th one
    const result = extractPost(malformed);
    expect(result).toBeNull();
  });
});

describe('extractAllPosts', () => {
  it('returns correct count of successfully extracted posts', () => {
    const result = extractAllPosts(doc);
    expect(result.items.length).toBe(3);
  });

  it('includes extraction errors for malformed posts', () => {
    const result = extractAllPosts(doc);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toContain('missing data-urn or id');
  });

  it('extracts all post IDs correctly', () => {
    const result = extractAllPosts(doc);
    const ids = result.items.map(p => p.postId);
    expect(ids).toContain('urn:li:activity:7100000000000000001');
    expect(ids).toContain('urn:li:activity:7100000000000000002');
    expect(ids).toContain('urn:li:activity:7100000000000000003');
  });
});

describe('matchesLinkedIn', () => {
  it('returns true for LinkedIn activity feed URLs', () => {
    expect(matchesLinkedIn('https://www.linkedin.com/in/simonwardley/recent-activity/all/')).toBe(true);
    expect(matchesLinkedIn('https://linkedin.com/in/someone/recent-activity/')).toBe(true);
  });

  it('returns false for non-matching URLs', () => {
    expect(matchesLinkedIn('https://www.linkedin.com/feed/')).toBe(false);
    expect(matchesLinkedIn('https://www.linkedin.com/in/simonwardley/')).toBe(false);
    expect(matchesLinkedIn('https://www.google.com')).toBe(false);
    expect(matchesLinkedIn('https://example.com/recent-activity/')).toBe(false);
  });
});
