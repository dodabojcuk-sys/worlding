export type AutosaveScheduler = { set(callback: () => void, delayMs: number): unknown; clear(handle: unknown): void };

/** Framework-neutral debounce/flush contract used by every Creation text adapter. */
export class CreationAutosaveController<T> {
  private handle: unknown = null;
  private pending: T | null = null;
  private readonly delayMs: number;
  private readonly scheduler: AutosaveScheduler;
  private readonly save: (value: T) => void;
  constructor(delayMs: number, scheduler: AutosaveScheduler, save: (value: T) => void) { this.delayMs = delayMs; this.scheduler = scheduler; this.save = save; }
  schedule(value: T): void {
    this.pending = value;
    if (this.handle !== null) this.scheduler.clear(this.handle);
    this.handle = this.scheduler.set(() => this.flush(), this.delayMs);
  }
  flush(): void {
    if (this.handle !== null) this.scheduler.clear(this.handle);
    this.handle = null;
    if (this.pending === null) return;
    const value = this.pending;
    this.pending = null;
    this.save(value);
  }
  cancel(): void { if (this.handle !== null) this.scheduler.clear(this.handle); this.handle = null; this.pending = null; }
}
