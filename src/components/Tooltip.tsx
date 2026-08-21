// ============================================================
// Tooltip — reusable hover tooltip for interactive elements
// ============================================================

import { useState, useRef, useCallback, useEffect } from 'react';

export interface TooltipProps {
  /** Content to show in the tooltip */
  content: string;
  /** Shortcut key to display (optional) */
  shortcut?: string;
  /** Position: 'top' (default), 'bottom', 'left', 'right' */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Delay before showing (ms) */
  delay?: number;
  /** The trigger element */
  children: React.ReactElement;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  shortcut,
  position = 'top',
  delay = 400,
  children,
}) => {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        let x = rect.left + rect.width / 2;
        let y = rect.top;
        if (position === 'bottom') {
          y = rect.bottom;
        } else if (position === 'left') {
          x = rect.left;
          y = rect.top + rect.height / 2;
        } else if (position === 'right') {
          x = rect.right;
          y = rect.top + rect.height / 2;
        }
        setCoords({ x, y });
        setVisible(true);
      }
    }, delay);
  }, [delay, position]);

  const hideTooltip = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const getTransform = (): string => {
    switch (position) {
      case 'top': return 'translate(-50%, -100%)';
      case 'bottom': return 'translate(-50%, 8px)';
      case 'left': return 'translate(-100%, -50%)';
      case 'right': return 'translate(8px, -50%)';
    }
  };

  return (
    <>
      <div
        ref={triggerRef}
        style={{ display: 'contents' }}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {children}
      </div>
      {visible && (
        <div
          className="tooltip-container"
          style={{
            position: 'fixed',
            left: coords.x,
            top: coords.y,
            transform: getTransform(),
            background: 'rgba(10, 15, 30, 0.96)',
            border: '1px solid #1a3050',
            borderRadius: 5,
            padding: '4px 8px',
            fontSize: 11,
            fontFamily: 'monospace',
            color: '#d0d0dd',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            gap: shortcut ? 8 : 0,
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}
        >
          <span>{content}</span>
          {shortcut && (
            <span style={{
              color: '#8888aa',
              fontSize: 10,
              background: 'rgba(15, 52, 96, 0.5)',
              padding: '1px 5px',
              borderRadius: 3,
              border: '1px solid rgba(15, 52, 96, 0.8)',
            }}>
              {shortcut}
            </span>
          )}
        </div>
      )}
    </>
  );
};

// ============================================================
// TooltipWrapper — wraps a button with tooltip (convenience)
// ============================================================

interface TooltipButtonProps {
  tooltip: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  title?: string;
  children: React.ReactNode;
}

export const TooltipButton: React.FC<TooltipButtonProps> = ({
  tooltip,
  shortcut,
  onClick,
  disabled,
  style,
  children,
}) => {
  return (
    <Tooltip content={tooltip} shortcut={shortcut} position="top" delay={500}>
      <button
        style={style}
        onClick={onClick}
        disabled={disabled}
      >
        {children}
      </button>
    </Tooltip>
  );
};
