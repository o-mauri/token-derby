// Node 26 defines its own `localStorage` global (unusable without
// --localstorage-file), and vitest skips copying a happy-dom window key the
// runtime already defines — so the DOM one never lands on globalThis. Stand a
// real happy-dom Storage up in its place.
for (const key of ['localStorage', 'sessionStorage'] as const) {
  if (globalThis[key] === undefined) {
    Object.defineProperty(globalThis, key, { value: new Storage(), configurable: true });
  }
}
