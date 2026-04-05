const BACKEND_URL = 'http://localhost:4242';

export type LogLevel = 'info' | 'warn' | 'error' | 'progress';

export class CrawlProgress {
  private taskId: string;
  private found = 0;
  private saved = 0;
  private errors = 0;

  constructor(taskId: string) {
    this.taskId = taskId;
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

  info(message: string, data?: Record<string, unknown>) { this.log('info', message, data); }
  warn(message: string, data?: Record<string, unknown>) { this.log('warn', message, data); }
  error(message: string, data?: Record<string, unknown>) { this.log('error', message, data); }

  /** Report progress counters */
  progress(found: number, saved: number, errors: number): void {
    this.found = found;
    this.saved = saved;
    this.errors = errors;
    this.log('progress', `Found: ${found}, Saved: ${saved}, Errors: ${errors}`, { found, saved, errors });
  }

  /** Increment saved counter and report */
  itemSaved(): void {
    this.saved++;
    this.log('progress', `Saved ${this.saved} items`, { found: this.found, saved: this.saved, errors: this.errors });
  }

  /** Increment error counter */
  itemError(message: string): void {
    this.errors++;
    this.log('error', message, { found: this.found, saved: this.saved, errors: this.errors });
  }

  /** Set the total found count */
  setFound(count: number): void {
    this.found = count;
  }
}
