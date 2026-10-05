/** Tiny localStorage-backed store for useSyncExternalStore (no hydration mismatch: server always uses the fallback). */
export function makeStore(key: string, fallback: string) {
  const listeners = new Set<() => void>();
  return {
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    get(): string {
      try {
        return localStorage.getItem(key) || fallback;
      } catch {
        return fallback;
      }
    },
    getServer(): string {
      return fallback;
    },
    set(value: string) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* private mode: keep working without persistence */
      }
      listeners.forEach((l) => l());
    },
  };
}
