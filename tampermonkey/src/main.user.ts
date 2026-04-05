import { crawlers } from './crawlers/index.js';
import { fetchPendingTasks, updateTaskStatus } from './lib/api.js';
import { CrawlProgress } from './lib/progress.js';
import type { Task, TaskConfig } from './lib/types.js';

(function () {
  'use strict';

  // Only run in the top window, avoiding iframes (CSP/API issues)
  if (window.self !== window.top) return;

  function normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname.replace(/\/+$/, '')}`;
    } catch {
      return url.replace(/\/+$/, '');
    }
  }

  function parseConfig(task: Task): TaskConfig {
    return task.config ? JSON.parse(task.config) : {};
  }

  /** Check whether a task is due for re-crawl based on its runMode. */
  function isDue(task: Task): boolean {
    const config = parseConfig(task);

    // One-time tasks move to 'completed' after running, so if we see one here
    // it's still pending and hasn't run yet — always due.
    if (config.runMode === 'once') {
      return true;
    }

    // Recurring tasks check the interval
    const intervalHours = parseFloat(String(config.recrawlIntervalHours));
    if (!intervalHours || intervalHours <= 0) return true;

    const lastRun = task.updatedAt ? new Date(task.updatedAt + 'Z').getTime() : 0;
    const now = Date.now();
    const elapsedHours = (now - lastRun) / (1000 * 60 * 60);
    return elapsedHours >= intervalHours;
  }

  function showIndicator(tasks: Task[]) {
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
    div.title = `${tasks.length} due crawls: ${tasks.map((t) => t.name).join(', ')}`;

    div.onclick = () => {
      const first = tasks[0];
      if (first?.targetUrl && confirm(`Crawl due: ${first.name}\n\nGo to target URL?`)) {
        window.location.href = first.targetUrl;
      }
    };

    document.body.appendChild(div);
  }

  async function init() {
    try {
      const tasks = await fetchPendingTasks();
      const currentUrl = window.location.href;
      const normalizedCurrent = normalizeUrl(currentUrl);

      // Find a task that matches the current URL AND is due for re-crawl
      const task = tasks.find((t) => {
        if (!t.targetUrl) return false;
        if (!normalizedCurrent.startsWith(normalizeUrl(t.targetUrl))) return false;
        return isDue(t);
      });

      if (task) {
        const crawler = crawlers.find((c) => c.match(currentUrl));
        if (crawler) {
          console.log('[Crawler] Task matched! Running crawler for task:', task.id);
          const config = parseConfig(task);
          const progress = new CrawlProgress(task.id);
          try {
            await updateTaskStatus(task.id, 'running');
            await crawler.run(task, config, progress);
            // Recurring tasks return to pending; one-time tasks complete
            const nextStatus = config.runMode === 'once' ? 'completed' : 'pending';
            await updateTaskStatus(task.id, nextStatus).catch(() => {});
          } catch (err) {
            console.error('[Crawler] Crawl failed:', err);
            progress.error(`Crawl failed: ${err}`);
            // On failure, always return to pending so it can be retried
            await updateTaskStatus(task.id, 'pending').catch(() => {});
          }
        }
      } else {
        // Show indicator only for due tasks (not ones recently crawled)
        const dueTasks = tasks.filter(isDue);
        showIndicator(dueTasks);
      }
    } catch (e) {
      console.error('[Crawler] Error checking tasks:', e);
    }
  }

  init();
})();
