// ============================================================
// Toast — lightweight notification popup component
// ============================================================

import { useEffect, useState } from 'react';
import {
  subscribeToToasts,
  getToastItems,
  type ToastItem,
} from '@/utils/toastService';

// ---------------------------------------------------------------
// Toast component
// ---------------------------------------------------------------

export const Toast: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>(getToastItems);

  useEffect(() => {
    return subscribeToToasts(setItems);
  }, []);

  if (items.length === 0) return null;

  return (
    <div style={styles.container}>
      {items.map((item) => (
        <div key={item.id} style={styles.toast}>
          {item.message}
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------
// Styles
// ---------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    zIndex: 200,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    pointerEvents: 'none',
  },
  toast: {
    background: 'rgba(22, 33, 62, 0.94)',
    color: '#eaeaea',
    border: '1px solid #0f3460',
    borderRadius: 8,
    padding: '8px 16px',
    fontSize: 13,
    fontFamily: 'monospace',
    backdropFilter: 'blur(6px)',
  },
};
