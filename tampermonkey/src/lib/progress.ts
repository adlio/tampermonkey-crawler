import { BACKEND_URL } from './api.js';

export type LogLevel = 'info' | 'warn' | 'error' | 'progress';

export class CrawlProgress {
  private taskId: string;
  private found = 0;
  private saved = 0;
  private errors = 0;
  private statusText = '';

  // On-page progress UI
  private container: HTMLElement | null = null;
  private barFill: HTMLElement | null = null;
  private label: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private rafPending = false;

  constructor(taskId: string) {
    this.taskId = taskId;
  }

  get savedCount() {
    return this.saved;
  }
  get errorCount() {
    return this.errors;
  }

  /** Attach a live progress bar to a DOM container element. */
  attachUI(container: HTMLElement): void {
    this.container = container;
    container.innerHTML = '';

    // Status line
    this.statusEl = document.createElement('div');
    this.statusEl.style.cssText =
      'font-size: 11px; color: #94a3b8; margin-bottom: 6px; min-height: 14px;';
    container.appendChild(this.statusEl);

    // Bar track
    const track = document.createElement('div');
    track.style.cssText =
      'background: #334155; border-radius: 4px; height: 8px; overflow: hidden; margin-bottom: 4px;';
    this.barFill = document.createElement('div');
    this.barFill.style.cssText =
      'background: #6366f1; height: 100%; width: 0%; border-radius: 4px; transition: width 0.3s ease;';
    track.appendChild(this.barFill);
    container.appendChild(track);

    // Counters label
    this.label = document.createElement('div');
    this.label.style.cssText = 'font-size: 11px; color: #cbd5e1; display: flex; gap: 12px;';
    container.appendChild(this.label);

    this.renderUI();
  }

  private scheduleRender(): void {
    if (!this.container || this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.renderUI();
    });
  }

  private renderUI(): void {
    if (!this.container) return;

    if (this.statusEl) {
      this.statusEl.textContent = this.statusText;
    }

    if (this.barFill) {
      const pct = this.found > 0 ? Math.round((this.saved / this.found) * 100) : 0;
      this.barFill.style.width = `${pct}%`;
      this.barFill.style.background = pct >= 100 ? '#4ade80' : '#6366f1';
    }

    if (this.label) {
      const parts = [`Found: ${this.found}`, `Saved: ${this.saved}`];
      if (this.errors > 0) parts.push(`Errors: ${this.errors}`);
      this.label.textContent = parts.join('  ·  ');
    }
  }

  /** Fire-and-forget log message to server */
  log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    console.log(`[Crawler:${level}] ${message}`);
    GM_xmlhttpRequest({
      method: 'POST',
      url: `${BACKEND_URL}/api/tasks/${this.taskId}/log`,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ level, message, data }),
      onload: () => {},
      onerror: () => {},
    });
  }

  info(message: string, data?: Record<string, unknown>) {
    this.statusText = message;
    this.scheduleRender();
    this.log('info', message, data);
  }
  warn(message: string, data?: Record<string, unknown>) {
    this.statusText = message;
    this.scheduleRender();
    this.log('warn', message, data);
  }
  error(message: string, data?: Record<string, unknown>) {
    this.statusText = message;
    this.scheduleRender();
    this.log('error', message, data);
  }

  /** Report progress counters */
  progress(found: number, saved: number, errors: number): void {
    this.found = found;
    this.saved = saved;
    this.errors = errors;
    this.scheduleRender();
    this.log('progress', `Found: ${found}, Saved: ${saved}, Errors: ${errors}`, {
      found,
      saved,
      errors,
    });
  }

  /** Increment saved counter and report */
  itemSaved(): void {
    this.saved++;
    this.scheduleRender();
    this.log('progress', `Saved ${this.saved} items`, {
      found: this.found,
      saved: this.saved,
      errors: this.errors,
    });
  }

  /** Increment error counter */
  itemError(message: string): void {
    this.errors++;
    this.scheduleRender();
    this.log('error', message, { found: this.found, saved: this.saved, errors: this.errors });
  }

  /** Set the total found count */
  setFound(count: number): void {
    this.found = count;
    this.scheduleRender();
  }

  /** Show a final completion/error state on the UI. */
  showResult(message: string, color: string): void {
    this.statusText = message;
    if (this.statusEl) {
      this.statusEl.style.color = color;
      this.statusEl.textContent = message;
    }
    if (this.barFill) {
      this.barFill.style.background = color;
    }
  }
}
