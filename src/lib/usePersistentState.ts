import { useCallback, useSyncExternalStore } from 'react';

type Listener = () => void;
type Updater<T> = T | ((prev: T) => T);

class PersistentStore<T> {
  private state: T;
  private listeners = new Set<Listener>();

  constructor(initial: T) {
    this.state = initial;
  }

  getState = (): T => this.state;

  setState = (updater: Updater<T>) => {
    const next =
      typeof updater === 'function'
        ? (updater as (prev: T) => T)(this.state)
        : updater;
    if (next === this.state) return;
    this.state = next;
    this.listeners.forEach((listener) => listener());
  };

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

// Registry keyed by string so multiple components/pages can share the same
// slice of state without needing a Context Provider wrapping the app.
const registry = new Map<string, PersistentStore<any>>();

function getOrCreateStore<T>(key: string, initial: T): PersistentStore<T> {
  if (!registry.has(key)) {
    registry.set(key, new PersistentStore<T>(initial));
  }
  return registry.get(key) as PersistentStore<T>;
}

/**
 * Drop-in replacement for useState that persists across component
 * unmount/remount (e.g. navigating away from a page and back), as long as
 * the JS module stays loaded (i.e. normal SPA navigation).
 *
 * `key` must be unique per logical piece of state (e.g. 'categoryEditor.categories').
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T
): [T, (updater: Updater<T>) => void] {
  const store = getOrCreateStore<T>(key, initialValue);
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const setState = useCallback((updater: Updater<T>) => store.setState(updater), [store]);
  return [state, setState];
}

/** Optional escape hatch, e.g. for a "reset this page" action. */
export function resetPersistentState(key: string) {
  registry.delete(key);
}