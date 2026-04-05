import type { SiteCrawler } from './index.js';
import { extractPost, queryWithFallbacks, POST_SELECTORS } from '../extractors/linkedin.js';

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

function sendToServer(taskId: string, site: string, itemKey: string, payload: any): Promise<void> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'POST',
      url: 'http://localhost:4242/api/collect',
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ site, taskId, itemKey, payload }),
      onload: (response) => {
        if (response.status >= 200 && response.status < 300) resolve();
        else reject(new Error(`Server returned ${response.status}: ${response.responseText}`));
      },
      onerror: (err) => reject(err),
    });
  });
}

export const linkedinCrawler: SiteCrawler = {
  name: 'linkedin',
  match: (url) => url.includes('linkedin.com/in/') && url.includes('/recent-activity/'),
  run: async (task, progress) => {
    progress.info('Starting LinkedIn crawl');

    // Wait for initial posts to appear
    for (let attempt = 0; attempt < 10; attempt++) {
      if (queryWithFallbacks(document, POST_SELECTORS).length > 0) break;
      progress.info('Waiting for posts to load...');
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (queryWithFallbacks(document, POST_SELECTORS).length === 0) {
      progress.error('No posts found after waiting. Selectors tried: ' + POST_SELECTORS.join(', '));
      throw new Error('No posts found after waiting.');
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

      for (const postEl of allPosts) {
        const postId = postEl.getAttribute('data-urn') || postEl.getAttribute('id');
        if (!postId || processedIds.has(postId)) continue;
        processedIds.add(postId);
        newPostsThisRound++;
        progress.setFound(processedIds.size);

        if (postId === lastSavedPostId) {
          progress.info('Reached previously saved post. Stopping.');
          hitLastSaved = true;
          break;
        }

        // Pure extraction — no side effects
        const extracted = extractPost(postEl);
        if (!extracted) {
          progress.itemError(`Failed to extract post: ${postId}`);
          continue;
        }

        // Fetch images as base64 (cross-origin requires GM_xmlhttpRequest)
        const images = (
          await Promise.all(
            extracted.imageUrls.map((url) =>
              fetchImageAsBase64(url).catch(() => {
                progress.warn(`Failed to fetch image: ${url}`);
                return null;
              }),
            ),
          )
        ).filter((img): img is { url: string; base64: string } => img !== null);

        const payload = {
          ...extracted,
          images: images.map((img) => ({
            url: img.url,
            name: img.url.split('/').pop()?.split('?')[0] || 'image.jpg',
            data: img.base64,
          })),
          timestamp: new Date().toISOString(),
        };

        try {
          await sendToServer(task.id, 'linkedin', postId, payload);
          savedCount++;
          progress.itemSaved();
        } catch (err) {
          progress.itemError(`Failed to save post ${postId}: ${err}`);
        }
      }

      if (hitLastSaved) break;

      // Scroll to load more
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 2000));

      if (newPostsThisRound === 0) {
        staleRounds++;
      } else {
        staleRounds = 0;
      }
    }

    progress.info(`Crawl complete. Saved ${savedCount} posts.`);
  },
};
