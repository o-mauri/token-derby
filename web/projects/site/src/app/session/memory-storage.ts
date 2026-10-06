/** A Storage that lives in memory: tests and previews use it in place of localStorage. */
export class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();
  constructor(seed: Record<string, string> = {}) { for (const [k, v] of Object.entries(seed)) this.items.set(k, v); }
  get length(): number { return this.items.size; }
  clear(): void { this.items.clear(); }
  getItem(key: string): string | null { return this.items.get(key) ?? null; }
  key(index: number): string | null { return [...this.items.keys()][index] ?? null; }
  removeItem(key: string): void { this.items.delete(key); }
  setItem(key: string, value: string): void { this.items.set(key, String(value)); }
}
