// ============================================================
// ContextMenu — reusable right-click context menu
// ============================================================

import { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  danger?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  visible,
  x,
  y,
  items,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay adding listener to avoid closing immediately from the same right-click
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handler);
    }, 10);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handler);
    };
  }, [visible, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 300,
        background: 'rgba(10, 15, 30, 0.97)',
        border: '1px solid #1a3050',
        borderRadius: 6,
        padding: '4px 0',
        minWidth: 170,
        backdropFilter: 'blur(8px)',
        userSelect: 'none',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5), 0 0 0 1px rgba(15, 52, 96, 0.3)',
      }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return (
            <div
              key={i}
              style={{
                height: 1,
                background: 'linear-gradient(to right, transparent, #0f3460, transparent)',
                margin: '3px 8px',
              }}
            />
          );
        }

        return (
          <div
            key={i}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              fontFamily: 'monospace',
              color: item.disabled
                ? '#444'
                : item.danger
                  ? '#e94560'
                  : '#d0d0dd',
              cursor: item.disabled ? 'default' : 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 20,
              opacity: item.disabled ? 0.5 : 1,
              borderRadius: 0,
              transition: 'background 0.08s ease',
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                e.currentTarget.style.background = item.danger
                  ? 'rgba(233, 69, 96, 0.12)'
                  : 'rgba(15, 52, 96, 0.5)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span style={{ color: '#666', fontSize: 11 }}>{item.shortcut}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};
