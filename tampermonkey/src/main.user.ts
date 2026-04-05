// Subtle Crawler Indicator
import { crawlers } from './sites/index.js';
import { CrawlProgress } from './lib/progress.js';

(function () {
  'use strict';

  // Only run in the top window, avoiding iframes (CSP/API issues)
  if (window.self !== window.top) return;

  const BACKEND_URL = 'http://localhost:4242'; // Default, update for Tailscale

  function normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Lowercase host (per spec), strip trailing slashes and query/hash
      return `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname.replace(/\/+$/, '')}`;
    } catch {
      return url.replace(/\/+$/, '');
    }
  }

  async function checkTasks(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${BACKEND_URL}/api/tasks/pending`,
        onload: (response) => {
          try {
            const tasks = JSON.parse(response.responseText);
            resolve(tasks);
          } catch (e) {
            reject(e);
          }
        },
        onerror: (err) => reject(err),
      });
    });
  }

  async function updateTaskStatus(taskId: string, status: string): Promise<void> {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: `${BACKEND_URL}/api/tasks/${taskId}/status`,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ status }),
        onload: () => resolve(),
        onerror: (err) => reject(err),
      });
    });
  }

  function showIndicator(tasks: any[]) {
    if (tasks.length === 0) return;

    const div = document.createElement('div');
    div.id = 'tm-crawler-indicator';
    div.style.position = 'fixed';
    div.style.bottom = '10px';
    div.style.right = '10px';
    div.style.width = '20px';
    div.style.height = '20px';
    div.style.borderRadius = '50%';
    div.style.backgroundColor = 'red';
    div.style.cursor = 'pointer';
    div.style.zIndex = '9999';
    div.title = `${tasks.length} pending crawls: ${tasks.map((t: any) => t.site).join(', ')}`;

    div.onclick = () => {
      const sites = tasks.map((t: any) => t.site).join(', ');
      if (confirm(`Crawl needed for: ${sites}\n\nDo you want to go to the first one?`)) {
        window.location.href = `https://${tasks[0].site}`;
      }
    };

    document.body.appendChild(div);
  }

  async function init() {
    try {
      const tasks = await checkTasks();
      const currentUrl = window.location.href;

      // Find a task that matches the current URL (normalized to handle trailing slashes, query params, etc.)
      const normalizedCurrent = normalizeUrl(currentUrl);
      const task = tasks.find((t) => {
        if (!t.targetUrl) return false;
        return normalizedCurrent.startsWith(normalizeUrl(t.targetUrl));
      });

      if (task) {
        const crawler = crawlers.find((c) => c.match(currentUrl));
        if (crawler) {
          console.log('[Crawler] Mission matched! Running crawler for task:', task.id);
          const progress = new CrawlProgress(task.id);
          try {
            await updateTaskStatus(task.id, 'running');
            await crawler.run(task, progress);
          } catch (err) {
            console.error('[Crawler] Crawl failed:', err);
            progress.error(`Crawl failed: ${err}`);
          } finally {
            // Always return to pending so the mission is ready for next visit
            await updateTaskStatus(task.id, 'pending').catch(() => {});
          }
        }
      } else {
        showIndicator(tasks);
      }
    } catch (e) {
      console.error('[Crawler] Error checking tasks:', e);
    }
  }

  // Check on load
  init();
})();
