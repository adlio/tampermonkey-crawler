import type { SiteCrawler } from '../index.js';
import { sendToServer, updateTaskConfig } from '../../lib/api.js';
import {
  extractPost,
  findVideoCdnUrls,
  matchesLinkedIn,
  queryWithFallbacks,
  POST_SELECTORS,
} from './extractors.js';

const DELAY_BETWEEN_POSTS_MS = 500;
const DELAY_BETWEEN_MEDIA_MS = 300;
const SCROLL_DELAY_MS = 2500;
const MAX_RETRIES = 10;
const RETRY_BASE_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchAsBase64(
  url: string,
  retries = MAX_RETRIES,
): Promise<{ url: string; base64: string }> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      responseType: 'arraybuffer',
      onload: async (response) => {
        // Retry on rate-limit or server errors
        if (response.status === 429 || response.status >= 500) {
          if (retries > 0) {
            const delay = Math.min(
              RETRY_BASE_MS * Math.pow(2, MAX_RETRIES - retries),
              MAX_BACKOFF_MS,
            );
            await sleep(delay);
            fetchAsBase64(url, retries - 1).then(resolve, reject);
            return;
          }
          reject(new Error(`HTTP ${response.status} after retries`));
          return;
        }
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
      onerror: async (err) => {
        if (retries > 0) {
          const delay = Math.min(
            RETRY_BASE_MS * Math.pow(2, MAX_RETRIES - retries),
            MAX_BACKOFF_MS,
          );
          await sleep(delay);
          fetchAsBase64(url, retries - 1).then(resolve, reject);
          return;
        }
        reject(new Error(`Network error: ${JSON.stringify(err)}`));
      },
    });
  });
}

/** Download media URLs sequentially with a delay between each to avoid CDN throttling. */
async function fetchMediaSequentially(
  urls: string[],
  onFail: (url: string) => void,
): Promise<{ url: string; base64: string }[]> {
  const results: { url: string; base64: string }[] = [];
  for (let i = 0; i < urls.length; i++) {
    if (i > 0) await sleep(DELAY_BETWEEN_MEDIA_MS);
    try {
      results.push(await fetchAsBase64(urls[i]));
    } catch {
      onFail(urls[i]);
    }
  }
  return results;
}

export const linkedinCrawler: SiteCrawler = {
  name: 'linkedin',
  domain: 'linkedin.com',
  match: matchesLinkedIn,
  run: async (task, config, progress) => {
    progress.info('Starting LinkedIn crawl');

    // Wait for initial posts to appear
    for (let attempt = 0; attempt < 10; attempt++) {
      if (queryWithFallbacks(document, POST_SELECTORS).length > 0) break;
      progress.info('Waiting for posts to load...');
      await sleep(2000);
    }

    if (queryWithFallbacks(document, POST_SELECTORS).length === 0) {
      progress.error('No posts found after waiting. Selectors tried: ' + POST_SELECTORS.join(', '));
      throw new Error('No posts found after waiting.');
    }

    // Clear stale bookmark if data was wiped (itemCount comes from /api/tasks/actionable)
    const lastSavedItemKey =
      config.lastSavedItemKey && task.itemCount ? config.lastSavedItemKey : null;
    const processedIds = new Set<string>();
    let staleRounds = 0;
    let hitLastSaved = false;
    let newestItemKey: string | null = null;
    let consecutiveServerErrors = 0;
    let lastBookmarkSave = 0;
    const MAX_STALE_ROUNDS = 3;
    const MAX_CONSECUTIVE_SERVER_ERRORS = 5;
    const BOOKMARK_SAVE_INTERVAL = 10; // save bookmark every N successful saves

    // Interleave scrolling and saving: process visible posts, scroll for more, repeat
    while (staleRounds < MAX_STALE_ROUNDS && !hitLastSaved) {
      const allPosts = queryWithFallbacks(document, POST_SELECTORS);
      let newPostsThisRound = 0;

      for (const postEl of allPosts) {
        const postId = postEl.getAttribute('data-urn') || postEl.getAttribute('id');
        if (!postId || processedIds.has(postId)) continue;
        processedIds.add(postId);
        newPostsThisRound++;
        progress.setFound(processedIds.size);

        if (postId === lastSavedItemKey) {
          progress.info('Reached previously saved post. Stopping.');
          hitLastSaved = true;
          break;
        }

        // Track the newest post (first one encountered) as the bookmark
        if (!newestItemKey) newestItemKey = postId;

        // Pure extraction — no side effects
        const extracted = extractPost(postEl);
        if (!extracted) {
          progress.itemError(`Failed to extract post: ${postId}`);
          continue;
        }

        // Fetch images sequentially with delays
        const images = await fetchMediaSequentially(extracted.imageUrls, (url) =>
          progress.warn(`Failed to fetch image: ${url}`),
        );

        // Fetch video poster and find CDN URLs from Performance API
        let videoPoster: { url: string; base64: string } | null = null;
        let videoCdnUrls: string[] = [];
        if (extracted.hasVideo) {
          if (extracted.videoPosterUrl) {
            videoPoster = await fetchAsBase64(extracted.videoPosterUrl).catch(() => {
              progress.warn(`Failed to fetch video poster: ${extracted.videoPosterUrl}`);
              return null;
            });
          }
          videoCdnUrls = findVideoCdnUrls(extracted.videoId);
        }

        const payload = {
          ...extracted,
          images: images.map((img) => ({
            url: img.url,
            name: img.url.split('/').pop()?.split('?')[0] || 'image.jpg',
            data: img.base64,
          })),
          videoPoster: videoPoster
            ? {
                url: videoPoster.url,
                name: 'video-poster.jpg',
                data: videoPoster.base64,
              }
            : null,
          videoCdnUrls,
          timestamp: new Date().toISOString(),
        };

        try {
          await sendToServer(task.id, 'linkedin', postId, payload);
          consecutiveServerErrors = 0;
          progress.itemSaved();

          // Periodically save bookmark so progress survives a refresh
          if (newestItemKey && progress.savedCount - lastBookmarkSave >= BOOKMARK_SAVE_INTERVAL) {
            lastBookmarkSave = progress.savedCount;
            updateTaskConfig(task.id, { lastSavedItemKey: newestItemKey }).catch(() => {});
          }
        } catch (err) {
          consecutiveServerErrors++;
          progress.itemError(`Failed to save post ${postId}: ${err}`);
          if (consecutiveServerErrors >= MAX_CONSECUTIVE_SERVER_ERRORS) {
            progress.error(`Aborting — ${MAX_CONSECUTIVE_SERVER_ERRORS} consecutive server errors`);
            break;
          }
        }

        // Delay between posts to avoid burst traffic
        await sleep(DELAY_BETWEEN_POSTS_MS);
      }

      if (hitLastSaved || consecutiveServerErrors >= MAX_CONSECUTIVE_SERVER_ERRORS) break;

      // Scroll to load more
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(SCROLL_DELAY_MS);

      if (newPostsThisRound === 0) {
        staleRounds++;
      } else {
        staleRounds = 0;
      }
    }

    // Save the newest post as bookmark for next incremental crawl
    if (newestItemKey) {
      updateTaskConfig(task.id, { lastSavedItemKey: newestItemKey }).catch(() => {});
    }

    progress.info(`Crawl complete. Saved ${progress.savedCount} posts.`);
  },
};
