import { useSyncExternalStore } from "react";

/**
 * Messages about waiting changes that cannot appear next to the control that made them,
 * because the page that made them is gone: a restored change the server rejected, or stored
 * changes that were too old to keep. Shown by `OfflineBanner` until dismissed.
 */
export interface Notice {
  id: number;
  text: string;
}

let notices: Notice[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function pushNotice(text: string): void {
  notices = [...notices, { id: nextId++, text }];
  emit();
}

export function dismissNotice(id: number): void {
  notices = notices.filter((notice) => notice.id !== id);
  emit();
}

export function useNotices(): readonly Notice[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => notices,
  );
}

/** For tests. */
export function resetNotices(): void {
  notices = [];
  emit();
}
