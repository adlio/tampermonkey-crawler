import type { LinkedInRawPost, ExtractionResult, ExtractionError } from './types.js';

// Multiple selector strategies for resilience against LinkedIn DOM changes.
// LinkedIn frequently renames CSS classes; data attributes and CDN URLs are more stable.
export const POST_SELECTORS = [
  '[data-urn*="urn:li:activity"]',
  '.feed-shared-update-v2',
  '.occludable-update',
];

export const TEXT_SELECTORS = [
  '.feed-shared-text',
  '.update-components-text',
  '.feed-shared-inline-show-more-text',
];

export const IMAGE_SELECTORS = [
  '.feed-shared-image img',
  '.update-components-image img',
  '.update-components-image__image',
];

// LinkedIn CDN URL patterns that are UI chrome, not post content
export const IGNORE_IMAGE_PATTERNS = [
  /profile-displayphoto/,
  /company-logo/,
  /group-logo/,
  /shrink_(?:48|100)_/,
  /ghost-person/,
  /ghost-organization/,
];

// Author / attribution selectors
export const ACTOR_SELECTORS = [
  '.update-components-actor__name span[aria-hidden="true"]',
  '.feed-shared-actor__name span[aria-hidden="true"]',
  '.update-components-actor__name',
  '.feed-shared-actor__name',
];

export const REPOST_HEADER_SELECTORS = [
  '.update-components-header__text',
  '.feed-shared-header__text',
];

// Timestamp / permalink selectors — the timestamp link contains the canonical post URL
export const PERMALINK_SELECTORS = [
  'a[href*="/feed/update/urn:li:activity:"]',
  '.update-components-actor__sub-description a[href*="activity"]',
  '.feed-shared-actor__sub-description a[href*="activity"]',
];

export const TIME_SELECTORS = [
  'time',
  '.update-components-actor__sub-description time',
  '.feed-shared-actor__sub-description time',
];

/**
 * Query the DOM using a list of selectors, returning results from the first
 * selector that matches at least one element.
 */
export function queryWithFallbacks(root: Element | Document, selectors: string[]): Element[] {
  for (const selector of selectors) {
    const elements = root.querySelectorAll(selector);
    if (elements.length > 0) return Array.from(elements);
  }
  return [];
}

/**
 * Extract structured data from a single LinkedIn post element.
 * Pure function — no side effects, no network calls.
 */
export function extractPost(post: Element): LinkedInRawPost | null {
  const postId = post.getAttribute('data-urn') || post.getAttribute('id');
  if (!postId) return null;

  // Extract author
  const actorElements = queryWithFallbacks(post, ACTOR_SELECTORS);
  const author =
    actorElements.length > 0 ? ((actorElements[0] as HTMLElement).textContent?.trim() ?? '') : '';

  // Detect reposts
  const headerElements = queryWithFallbacks(post, REPOST_HEADER_SELECTORS);
  const headerText =
    headerElements.length > 0 ? ((headerElements[0] as HTMLElement).textContent?.trim() ?? '') : '';
  const isRepost = /repost/i.test(headerText);
  const repostedBy = isRepost ? headerText.replace(/\s*reposted\s*$/i, '').trim() : '';

  // Extract text with fallback selectors
  const textElements = queryWithFallbacks(post, TEXT_SELECTORS);
  const text =
    textElements.length > 0 ? ((textElements[0] as HTMLElement).textContent?.trim() ?? '') : '';

  // Extract canonical post URL from permalink/timestamp link
  const permalinkElements = queryWithFallbacks(post, PERMALINK_SELECTORS);
  let postUrl = '';
  if (permalinkElements.length > 0) {
    const href = (permalinkElements[0] as HTMLAnchorElement).getAttribute('href') ?? '';
    postUrl = href.startsWith('http') ? href : `https://www.linkedin.com${href}`;
  }
  if (!postUrl) {
    const activityId = postId.replace(/^urn:li:activity:/, '');
    postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`;
  }

  // Extract post date from <time> element
  const timeElements = queryWithFallbacks(post, TIME_SELECTORS);
  let postDate = '';
  if (timeElements.length > 0) {
    postDate = timeElements[0].getAttribute('datetime') ?? '';
  }

  // Generate a title from the first sentence/line of the post
  const firstLine = text.split(/\n/)[0].trim();
  const title =
    firstLine.length > 100
      ? firstLine.substring(0, 100).replace(/\s+\S*$/, '') + '\u2026'
      : firstLine;

  // Extract unique content image URLs, filtering out profile pics, logos, etc.
  const imageElements = queryWithFallbacks(post, IMAGE_SELECTORS);
  const imageUrls = Array.from(
    new Set(
      imageElements
        .map((img) => (img as HTMLImageElement).getAttribute('src') ?? '')
        .filter(
          (src) =>
            src !== '' &&
            !src.startsWith('data:') &&
            !IGNORE_IMAGE_PATTERNS.some((pattern) => pattern.test(src)),
        ),
    ),
  );

  return {
    postId,
    postUrl,
    postDate,
    title,
    author,
    isRepost,
    repostedBy,
    text,
    imageUrls,
  };
}

/**
 * Collect post elements from all POST_SELECTORS, deduplicating across selectors.
 * Unlike queryWithFallbacks (which returns the first matching selector's results),
 * this ensures malformed posts matched by a later selector are still included.
 */
function collectAllPostElements(root: Element | Document): Element[] {
  const seen = new Set<Element>();
  const result: Element[] = [];
  for (const selector of POST_SELECTORS) {
    for (const el of root.querySelectorAll(selector)) {
      if (!seen.has(el)) {
        seen.add(el);
        result.push(el);
      }
    }
  }
  return result;
}

/**
 * Extract all LinkedIn posts from a root element or document.
 * Returns both successfully extracted items and any extraction errors.
 */
export function extractAllPosts(root: Element | Document): ExtractionResult<LinkedInRawPost> {
  const items: LinkedInRawPost[] = [];
  const errors: ExtractionError[] = [];

  const postElements = collectAllPostElements(root);

  postElements.forEach((post, index) => {
    try {
      const result = extractPost(post);
      if (result) {
        items.push(result);
      } else {
        errors.push({
          index,
          selector: POST_SELECTORS.join(' | '),
          message: 'Post element missing data-urn or id attribute',
        });
      }
    } catch (err) {
      errors.push({
        index,
        selector: POST_SELECTORS.join(' | '),
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return { items, errors };
}

/**
 * Check whether a URL matches the LinkedIn activity feed pattern.
 */
export function matchesLinkedIn(url: string): boolean {
  return url.includes('linkedin.com/in/') && url.includes('/recent-activity/');
}
