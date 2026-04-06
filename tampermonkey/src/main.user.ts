import { crawlers } from './crawlers/index.js';
import type { SiteCrawler } from './crawlers/index.js';
import { fetchPendingTasks, updateTaskStatus } from './lib/api.js';
import { CrawlProgress } from './lib/progress.js';
import type { Task, TaskConfig } from './lib/types.js';

const GM_PENDING_TASK_KEY = 'pendingCrawlTaskId';

(function () {
  'use strict';

  // Only run in the top window, avoiding iframes (CSP/API issues)
  if (window.self !== window.top) return;

  function parseConfig(task: Task): TaskConfig {
    return task.config ? JSON.parse(task.config) : {};
  }

  /** Check whether a task is due for re-crawl based on its runMode. */
  function isDue(task: Task): boolean {
    const config = parseConfig(task);

    if (config.runMode === 'once') {
      return true;
    }

    const intervalHours = parseFloat(String(config.recrawlIntervalHours));
    if (!intervalHours || intervalHours <= 0) return true;

    const lastRun = task.updatedAt ? new Date(task.updatedAt + 'Z').getTime() : 0;
    const now = Date.now();
    const elapsedHours = (now - lastRun) / (1000 * 60 * 60);
    return elapsedHours >= intervalHours;
  }

  /** Find which crawler handles this domain. */
  function findCrawlerForDomain(hostname: string): SiteCrawler | undefined {
    return crawlers.find((c) => hostname.endsWith(c.domain));
  }

  /** Find due tasks that belong to a given crawler (by site id). */
  function findDueTasks(tasks: Task[], crawlerName: string): Task[] {
    return tasks.filter((t) => t.site === crawlerName && isDue(t));
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
    header.textContent = `${dueTasks.length} crawl${dueTasks.length === 1 ? '' : 's'} due`;

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

      const btn = document.createElement('button');
      btn.textContent = 'Run';
      btn.style.cssText = `
        background: #6366f1; color: white; border: none; border-radius: 6px;
        padding: 4px 12px; font-size: 12px; font-weight: 600; cursor: pointer;
        flex-shrink: 0;
      `;
      btn.onmouseenter = () => (btn.style.background = '#4f46e5');
      btn.onmouseleave = () => (btn.style.background = '#6366f1');
      btn.onclick = () => startCrawl(task, crawler, panel);

      row.appendChild(label);
      row.appendChild(btn);
      panel.appendChild(row);
    }

    return panel;
  }

  function showStatus(panel: HTMLElement, message: string, color = '#94a3b8') {
    panel.innerHTML = '';
    const status = document.createElement('div');
    status.style.cssText = `font-size: 12px; color: ${color}; padding: 4px 0;`;
    status.textContent = message;
    panel.appendChild(status);
  }

  // ---------------------------------------------------------------------------
  // Crawl execution
  // ---------------------------------------------------------------------------

  async function startCrawl(task: Task, crawler: SiteCrawler, panel: HTMLElement) {
    const currentUrl = window.location.href;

    if (crawler.match(currentUrl)) {
      // We're already on the right page — run immediately
      await executeCrawl(task, crawler, panel);
    } else if (task.targetUrl) {
      // Need to navigate — persist intent and go
      showStatus(panel, 'Navigating to target page...');
      GM_setValue(GM_PENDING_TASK_KEY, task.id);
      window.location.href = task.targetUrl;
    }
  }

  async function executeCrawl(task: Task, crawler: SiteCrawler, panel: HTMLElement) {
    const config = parseConfig(task);
    const progress = new CrawlProgress(task.id);

    showStatus(panel, 'Running crawl...', '#a5b4fc');

    try {
      await updateTaskStatus(task.id, 'running');
      await crawler.run(task, config, progress);
      const nextStatus = config.runMode === 'once' ? 'completed' : 'pending';
      await updateTaskStatus(task.id, nextStatus).catch(() => {});
      showStatus(panel, 'Crawl complete!', '#4ade80');
    } catch (err) {
      console.error('[Crawler] Crawl failed:', err);
      progress.error(`Crawl failed: ${err}`);
      await updateTaskStatus(task.id, 'pending').catch(() => {});
      showStatus(panel, `Crawl failed: ${err}`, '#f87171');
    }
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  async function init() {
    const hostname = window.location.hostname;
    const crawler = findCrawlerForDomain(hostname);
    if (!crawler) return; // Not on a supported domain

    try {
      const tasks = await fetchPendingTasks();

      // Check if we arrived here from a "Run" click (navigation with stored intent)
      const pendingTaskId = GM_getValue(GM_PENDING_TASK_KEY, null);
      if (pendingTaskId) {
        GM_setValue(GM_PENDING_TASK_KEY, null);
        const task = tasks.find((t) => t.id === pendingTaskId);
        if (task && crawler.match(window.location.href)) {
          console.log('[Crawler] Resuming stored crawl for task:', task.id);
          const panel = createPanel([], crawler);
          document.body.appendChild(panel);
          await executeCrawl(task, crawler, panel);
          return;
        }
      }

      // Normal flow: show panel with due tasks
      const dueTasks = findDueTasks(tasks, crawler.name);
      if (dueTasks.length > 0) {
        document.body.appendChild(createPanel(dueTasks, crawler));
      }
    } catch (e) {
      console.error('[Crawler] Error checking tasks:', e);
    }
  }

  init();
})();
