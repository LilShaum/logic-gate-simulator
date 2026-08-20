// ============================================================
// Toast notification service — call from anywhere
// ============================================================

export interface ToastItem {
  id: number;
  message: string;
}

let nextId = 0;

/** Internal store so non-component code can trigger toasts */
let listeners: Array<(items: ToastItem[]) => void> = [];
let toastItems: ToastItem[] = [];

const notify = () => {
  for (const fn of listeners) fn([...toastItems]);
};

/** Show a toast notification. Can be called from anywhere. */
export const showToast = (message: string, duration = 2000): void => {
  const item: ToastItem = { id: nextId++, message };
  toastItems = [...toastItems, item];
  notify();

  setTimeout(() => {
    toastItems = toastItems.filter((t) => t.id !== item.id);
    notify();
  }, duration);
};

/** Subscribe to toast changes (used by the Toast component) */
export const subscribeToToasts = (
  listener: (items: ToastItem[]) => void,
): (() => void) => {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((fn) => fn !== listener);
  };
};

/** Get current toast items (for initial render) */
export const getToastItems = (): ToastItem[] => [...toastItems];
