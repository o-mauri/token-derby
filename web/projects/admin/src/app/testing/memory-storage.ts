/** An in-memory Storage for tests. */
export class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  constructor(seed: Record<string, string> = {}) { for (const [k, v] of Object.entries(seed)) this.map.set(k, v); }
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  key(i: number): string | null { return [...this.map.keys()][i] ?? null; }
  removeItem(key: string): void { this.map.delete(key); }
  setItem(key: string, value: string): void { this.map.set(key, value); }
}
