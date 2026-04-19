import { crawlers } from './crawlers/index.js';
import type { SiteCrawler } from './crawlers/index.js';
import { fetchActionableTasks, updateTaskStatus } from './lib/api.js';
import { CrawlProgress } from './lib/progress.js';
import type { Task, TaskConfig } from './lib/types.js';

const GM_PENDING_TASK_KEY = 'pendingCrawlTaskId';

(function () {
  'use strict';

  let crawlInProgress = false;

  console.log('[Crawler] Script loaded on', window.location.hostname);

  function parseConfig(task: Task): TaskConfig {
    return task.config ? JSON.parse(task.config) : {};
  }

  /** Find which crawler handles the current page (domain match or DOM detection). */
  function findCrawlerForPage(hostname: string): SiteCrawler | undefined {
    // 1. Try exact domain match (existing behavior)
    const domainMatch = crawlers.find((c) => c.domain && hostname.endsWith(c.domain));
    if (domainMatch) return domainMatch;

    // 2. Try DOM-based detection for domain-agnostic crawlers (e.g. dealer)
    return crawlers.find((c) => !c.domain && c.match(window.location.href, document));
  }

  // ---------------------------------------------------------------------------
  // Panel UI
  // ---------------------------------------------------------------------------

  function createPanel(dueTasks: Task[], crawler: SiteCrawler): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'tm-crawler-panel';
    panel.style.cssText = `
      position: fixed; bottom: 16px; right: 16px; z-index: 99999;
      background: #1e293b; color: #f8fafc; border-radius: 12px;
      padding: 12px 16px; font-family: system-ui, sans-serif;
      font-size: 13px; box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      max-width: 320px; min-width: 240px;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      font-weight: 700; font-size: 11px; text-transform: uppercase;
      letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 8px;
      display: flex; justify-content: space-between; align-items: center;
    `;
    header.textContent = `${dueTasks.length} crawl${dueTasks.length === 1 ? '' : 's'} available`;

    const closeBtn = document.createElement('span');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'cursor: pointer; font-size: 14px; color: #64748b;';
    closeBtn.onclick = () => panel.remove();
    header.appendChild(closeBtn);
    panel.appendChild(header);

    for (const task of dueTasks) {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex; justify-content: space-between; align-items: center;
        padding: 6px 0; border-top: 1px solid #334155;
      `;

      const label = document.createElement('span');
      label.textContent = task.name;
      label.style.cssText =
        'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 8px;';

      const runBtn = document.createElement('button');
      runBtn.textContent = 'Run';
      runBtn.style.cssText = `
        background: #6366f1; color: white; border: none; border-radius: 6px;
        padding: 4px 10px; font-size: 12px; font-weight: 600; cursor: pointer;
        flex-shrink: 0;
      `;
      runBtn.onmouseenter = () => (runBtn.style.background = '#4f46e5');
      runBtn.onmouseleave = () => (runBtn.style.background = '#6366f1');
      runBtn.onclick = () => startCrawl(task, crawler, panel);

      row.appendChild(label);
      row.appendChild(runBtn);
      panel.appendChild(row);
    }

    return panel;
  }

  /** Replace panel contents with a progress bar container for the crawl. */
  function showProgressUI(panel: HTMLElement, taskName: string): HTMLElement {
    panel.innerHTML = '';

    const header = document.createElement('div');
    header.style.cssText =
      'font-weight: 600; font-size: 12px; color: #e2e8f0; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    header.textContent = taskName;
    panel.appendChild(header);

    const progressContainer = document.createElement('div');
    panel.appendChild(progressContainer);
    return progressContainer;
  }

  // ---------------------------------------------------------------------------
  // Crawl execution
  // ---------------------------------------------------------------------------

  async function startCrawl(task: Task, crawler: SiteCrawler, panel: HTMLElement) {
    if (crawlInProgress) return;
    crawlInProgress = true;

    const currentUrl = window.location.href;

    if (crawler.match(currentUrl, document)) {
      await executeCrawl(task, crawler, panel);
    } else if (task.targetUrl) {
      const container = showProgressUI(panel, task.name);
      const progress = new CrawlProgress(task.id);
      progress.attachUI(container);
      progress.info('Navigating to target page...');
      GM_setValue(GM_PENDING_TASK_KEY, task.id);
      window.location.href = task.targetUrl;
    }
  }

  async function executeCrawl(task: Task, crawler: SiteCrawler, panel: HTMLElement) {
    const config = parseConfig(task);
    const progress = new CrawlProgress(task.id);

    const container = showProgressUI(panel, task.name);
    progress.attachUI(container);
    progress.info('Starting crawl...');

    try {
      await updateTaskStatus(task.id, 'running');
      await crawler.run(task, config, progress);

      const allFailed = progress.errorCount > 0 && progress.savedCount === 0;
      const nextStatus = allFailed ? 'failed' : config.runMode === 'once' ? 'completed' : 'pending';
      await updateTaskStatus(task.id, nextStatus).catch(() => {});

      if (allFailed) {
        progress.showResult(`Failed — ${progress.errorCount} errors, nothing saved`, '#f87171');
      } else if (progress.errorCount > 0) {
        progress.showResult(
          `Done with ${progress.errorCount} error${progress.errorCount === 1 ? '' : 's'} — ${progress.savedCount} saved`,
          '#fbbf24',
        );
      } else {
        progress.showResult(`Crawl complete — ${progress.savedCount} saved`, '#4ade80');
      }
    } catch (err) {
      console.error('[Crawler] Crawl failed:', err);
      progress.error(`Crawl failed: ${err}`);
      await updateTaskStatus(task.id, 'failed').catch(() => {});
      progress.showResult(`Crawl failed: ${err}`, '#f87171');
    } finally {
      crawlInProgress = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  async function init() {
    // Prevent duplicate panels (SPA navigation can re-trigger init)
    if (document.getElementById('tm-crawler-panel')) return;

    const hostname = window.location.hostname;
    console.log('[Crawler] Checking domain:', hostname);
    const crawler = findCrawlerForPage(hostname);
    if (!crawler) {
      console.log('[Crawler] No crawler registered for this domain');
      return;
    }
    console.log('[Crawler] Matched crawler:', crawler.name);

    try {
      const tasks = await fetchActionableTasks();
      console.log('[Crawler] Actionable tasks:', tasks.length);

      const matchingTasks = tasks.filter((t) => {
        if (t.site !== crawler.name) return false;
        // For domain-agnostic crawlers (dealer), also match targetUrl hostname
        if (!crawler.domain && t.targetUrl) {
          try {
            return hostname === new URL(t.targetUrl).hostname;
          } catch {
            return false;
          }
        }
        return true;
      });

      // Reset any stale "running" tasks back to pending (interrupted by refresh/nav)
      for (const task of matchingTasks) {
        if (task.status === 'running') {
          console.log('[Crawler] Resetting interrupted task:', task.id);
          await updateTaskStatus(task.id, 'pending').catch(() => {});
          task.status = 'pending';
        }
      }

      // Check if we arrived here from a "Run" click (navigation with stored intent)
      const pendingTaskId = GM_getValue(GM_PENDING_TASK_KEY, null);
      if (pendingTaskId) {
        GM_setValue(GM_PENDING_TASK_KEY, null);
        const task = matchingTasks.find((t) => t.id === pendingTaskId);
        if (task && crawler.match(window.location.href, document)) {
          console.log('[Crawler] Resuming stored crawl for task:', task.id);
          const panel = createPanel([], crawler);
          document.body.appendChild(panel);
          await executeCrawl(task, crawler, panel);
          return;
        }
      }

      // Show panel for all matching tasks
      console.log('[Crawler] Tasks for', crawler.name + ':', matchingTasks.length);
      if (matchingTasks.length > 0) {
        document.body.appendChild(createPanel(matchingTasks, crawler));
      }
    } catch (e) {
      console.error('[Crawler] Error checking tasks:', e);
    }
  }

  init();
})();
