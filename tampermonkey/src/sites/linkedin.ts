import { SiteCrawler } from './index.js';

// Multiple selector strategies for resilience against LinkedIn DOM changes.
// LinkedIn frequently renames CSS classes; data attributes and CDN URLs are more stable.
const POST_SELECTORS = [
  '[data-urn*="urn:li:activity"]',
  '.feed-shared-update-v2',
  '.occludable-update',
];

const TEXT_SELECTORS = [
  '.feed-shared-text',
  '.update-components-text',
  '.feed-shared-inline-show-more-text',
];

const IMAGE_SELECTORS = [
  '.feed-shared-image img',
  '.update-components-image img',
  '.update-components-image__image',
];

// LinkedIn CDN URL patterns that are UI chrome, not post content
const IGNORE_IMAGE_PATTERNS = [
  /profile-displayphoto/,
  /company-logo/,
  /group-logo/,
  /shrink_(?:48|100)_/,
  /ghost-person/,
  /ghost-organization/,
];

// Author / attribution selectors
const ACTOR_SELECTORS = [
  '.update-components-actor__name span[aria-hidden="true"]',
  '.feed-shared-actor__name span[aria-hidden="true"]',
  '.update-components-actor__name',
  '.feed-shared-actor__name',
];

const REPOST_HEADER_SELECTORS = [
  '.update-components-header__text',
  '.feed-shared-header__text',
];

// Timestamp / permalink selectors — the timestamp link contains the canonical post URL
const PERMALINK_SELECTORS = [
  'a[href*="/feed/update/urn:li:activity:"]',
  '.update-components-actor__sub-description a[href*="activity"]',
  '.feed-shared-actor__sub-description a[href*="activity"]',
];

const TIME_SELECTORS = [
  'time',
  '.update-components-actor__sub-description time',
  '.feed-shared-actor__sub-description time',
];

function queryWithFallbacks(root: Element | Document, selectors: string[]): Element[] {
  for (const selector of selectors) {
    const elements = root.querySelectorAll(selector);
    if (elements.length > 0) return Array.from(elements);
  }
  return [];
}

async function fetchImageAsBase64(url: string): Promise<{ url: string; base64: string }> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      responseType: 'arraybuffer',
      onload: (response) => {
        try {
          const bytes = new Uint8Array(response.response as ArrayBuffer);
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
          }
          resolve({ url, base64: btoa(binary) });
        } catch (e) {
          reject(e);
        }
      },
      onerror: (err) => reject(err),
    });
  });
}

async function sendPost(task: any, post: Element): Promise<boolean> {
  const postId = post.getAttribute('data-urn') || post.getAttribute('id');
  if (!postId) return false;

  // Extract author and detect reposts
  const actorElements = queryWithFallbacks(post, ACTOR_SELECTORS);
  const author = actorElements.length > 0
    ? (actorElements[0] as HTMLElement).innerText.trim()
    : '';

  const headerElements = queryWithFallbacks(post, REPOST_HEADER_SELECTORS);
  const headerText = headerElements.length > 0
    ? (headerElements[0] as HTMLElement).innerText.trim()
    : '';
  const isRepost = /repost/i.test(headerText);
  const repostedBy = isRepost ? headerText.replace(/\s*reposted\s*$/i, '').trim() : '';

  // Extract text with fallback selectors
  const textElements = queryWithFallbacks(post, TEXT_SELECTORS);
  const text = textElements.length > 0 ? (textElements[0] as HTMLElement).innerText : '';

  // Extract canonical post URL from permalink/timestamp link
  const permalinkElements = queryWithFallbacks(post, PERMALINK_SELECTORS);
  let postUrl = '';
  if (permalinkElements.length > 0) {
    const href = (permalinkElements[0] as HTMLAnchorElement).href;
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
    postDate = timeElements[0].getAttribute('datetime') || '';
  }

  // Generate a title from the first sentence/line of the post
  const firstLine = text.split(/\n/)[0].trim();
  const title = firstLine.length > 100
    ? firstLine.substring(0, 100).replace(/\s+\S*$/, '') + '…'
    : firstLine;

  // Extract unique content image URLs, filtering out profile pics, logos, etc.
  const imageElements = queryWithFallbacks(post, IMAGE_SELECTORS);
  const imageUrls = Array.from(new Set(
    imageElements
      .map(img => (img as HTMLImageElement).src)
      .filter(src => src && !src.startsWith('data:')
        && !IGNORE_IMAGE_PATTERNS.some(pattern => pattern.test(src)))
  ));

  // Fetch images as base64
  const images = (await Promise.all(
    imageUrls.map(url =>
      fetchImageAsBase64(url).catch(err => {
        console.warn(`[LinkedIn] Failed to fetch image: ${url}`, err);
        return null;
      })
    )
  )).filter((img): img is { url: string; base64: string } => img !== null);

  const payload = {
    postId,
    postUrl,
    postDate,
    title,
    author,
    ...(isRepost ? { repostedBy } : {}),
    text,
    images: images.map(img => ({
      url: img.url,
      name: img.url.split('/').pop()?.split('?')[0] || 'image.jpg',
      data: img.base64,
    })),
    timestamp: new Date().toISOString(),
  };

  await new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'POST',
      url: 'http://localhost:4242/api/collect',
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        site: 'linkedin',
        taskId: task.id,
        payload,
      }),
      onload: (response) => {
        if (response.status >= 200 && response.status < 300) resolve(response);
        else reject(new Error(`Server returned ${response.status}: ${response.responseText}`));
      },
      onerror: (err) => reject(err),
    });
  });

  console.log(`[LinkedIn] Saved post: ${postId}`);
  return true;
}

export const linkedinCrawler: SiteCrawler = {
  match: (url) => url.includes('linkedin.com/in/') && url.includes('/recent-activity/'),
  run: async (task) => {
    console.log('[LinkedIn] Starting crawl for task:', task.id);

    // Wait for initial posts to appear
    for (let attempt = 0; attempt < 10; attempt++) {
      if (queryWithFallbacks(document, POST_SELECTORS).length > 0) break;
      console.log('[LinkedIn] Waiting for posts to load...');
      await new Promise(r => setTimeout(r, 2000));
    }

    if (queryWithFallbacks(document, POST_SELECTORS).length === 0) {
      throw new Error(
        'No posts found after waiting. LinkedIn may have changed their DOM structure. ' +
        'Tried selectors: ' + POST_SELECTORS.join(', ')
      );
    }

    const config = task.config ? JSON.parse(task.config) : {};
    const lastSavedPostId = config.lastSavedPostId;
    const processedIds = new Set<string>();
    let savedCount = 0;
    let staleRounds = 0;
    let hitLastSaved = false;
    const MAX_STALE_ROUNDS = 3;

    // Interleave scrolling and saving: process visible posts, scroll for more, repeat
    while (staleRounds < MAX_STALE_ROUNDS && !hitLastSaved) {
      const allPosts = queryWithFallbacks(document, POST_SELECTORS);
      let newPostsThisRound = 0;

      for (const post of allPosts) {
        const postId = post.getAttribute('data-urn') || post.getAttribute('id');
        if (!postId || processedIds.has(postId)) continue;
        processedIds.add(postId);
        newPostsThisRound++;

        if (postId === lastSavedPostId) {
          console.log('[LinkedIn] Reached previously saved post. Stopping.');
          hitLastSaved = true;
          break;
        }

        if (await sendPost(task, post)) {
          savedCount++;
        }
      }

      if (hitLastSaved) break;

      // Scroll to load more
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(r => setTimeout(r, 2000));

      const postCountAfterScroll = queryWithFallbacks(document, POST_SELECTORS).length;
      if (newPostsThisRound === 0) {
        staleRounds++;
      } else {
        staleRounds = 0;
        console.log(`[LinkedIn] Processed batch — ${savedCount} saved so far, ${postCountAfterScroll} posts in DOM`);
      }
    }

    console.log(`[LinkedIn] Crawl complete. Saved ${savedCount} posts.`);
  },
};
