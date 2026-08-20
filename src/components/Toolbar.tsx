// ============================================================
// Toolbar — zoom controls, grid toggle, undo/redo, reset view,
//           keyboard shortcuts help overlay
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import type { Viewport } from '@/types/circuit';

interface ToolbarProps {
  viewport: Viewport;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onFitAll: () => void;
  /** Undo/redo */
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  onUndo: () => void;
  onRedo: () => void;
  /** Grid snap */
  gridSnapEnabled: boolean;
  onToggleGridSnap: () => void;
}

// ---------------------------------------------------------------
// Keyboard shortcuts data
// ---------------------------------------------------------------

const SHORTCUTS = [
  { category: 'Navigation', items: [
    { keys: 'Scroll wheel', desc: 'Zoom in/out' },
    { keys: 'Middle drag', desc: 'Pan canvas' },
    { keys: 'Space + drag', desc: 'Pan canvas' },
    { keys: 'Alt + drag', desc: 'Pan canvas' },
  ]},
  { category: 'Editing', items: [
    { keys: 'Delete / Backspace', desc: 'Delete selected' },
    { keys: 'Ctrl + A', desc: 'Select all gates' },
    { keys: 'Ctrl + C', desc: 'Copy selected' },
    { keys: 'Ctrl + X', desc: 'Cut selected' },
    { keys: 'Ctrl + V', desc: 'Paste' },
  ]},
  { category: 'Undo / Redo', items: [
    { keys: 'Ctrl + Z', desc: 'Undo' },
    { keys: 'Ctrl + Y / Ctrl+Shift+Z', desc: 'Redo' },
  ]},
  { category: 'Gates', items: [
    { keys: 'Double-click INPUT', desc: 'Toggle input value' },
    { keys: 'Double-click Block', desc: 'Edit block internals' },
    { keys: 'Shift + click', desc: 'Toggle gate in selection' },
    { keys: 'Click + drag', desc: 'Move selected gates' },
  ]},
  { category: 'Wiring', items: [
    { keys: 'Click output port', desc: 'Start wire' },
    { keys: 'Click input port', desc: 'Connect wire' },
    { keys: 'Escape', desc: 'Cancel wire' },
  ]},
  { category: 'Other', items: [
    { keys: '? button', desc: 'Toggle this help' },
  ]},
];

// ---------------------------------------------------------------
// Help overlay component
// ---------------------------------------------------------------

const HelpOverlay: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    }}
    onClick={onClose}
  >
    <div
      style={{
        background: 'rgba(22, 33, 62, 0.97)',
        border: '1px solid #0f3460',
        borderRadius: 12,
        padding: '20px 28px',
        maxWidth: 520,
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto',
        color: '#eaeaea',
        fontFamily: 'monospace',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, color: '#53a8b6' }}>Keyboard Shortcuts</h2>
        <button
          style={{
            background: 'none',
            border: '1px solid #0f3460',
            color: '#8888aa',
            fontSize: 14,
            cursor: 'pointer',
            borderRadius: 4,
            padding: '2px 8px',
            fontFamily: 'monospace',
          }}
          onClick={onClose}
        >
          ESC
        </button>
      </div>
      {SHORTCUTS.map((section) => (
        <div key={section.category} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#53a8b6', fontWeight: 'bold', marginBottom: 4, textTransform: 'uppercase' }}>
            {section.category}
          </div>
          {section.items.map((item, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '3px 0',
                fontSize: 12,
                borderBottom: '1px solid rgba(15,52,96,0.4)',
              }}
            >
              <span style={{ color: '#ffb347', fontSize: 11 }}>{item.keys}</span>
              <span style={{ color: '#aaa' }}>{item.desc}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
);

// ---------------------------------------------------------------
// Main toolbar component
// ---------------------------------------------------------------

export const Toolbar: React.FC<ToolbarProps> = ({
  viewport,
  onZoomIn,
  onZoomOut,
  onResetView,
  onFitAll,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
  gridSnapEnabled,
  onToggleGridSnap,
}) => {
  const [helpVisible, setHelpVisible] = useState(false);

  const toggleHelp = useCallback(() => {
    setHelpVisible((v) => !v);
  }, []);

  // Global keyboard shortcut for help toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '?') {
        e.preventDefault();
        setHelpVisible((v) => !v);
      }
      if (e.key === 'Escape' && helpVisible) {
        setHelpVisible(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [helpVisible]);

  return (
    <>
      <div style={styles.container}>
        <div style={styles.row}>
          {/* Zoom controls */}
          <button style={styles.button} onClick={onZoomOut} title="Zoom out">
            -
          </button>
          <span style={styles.zoomLabel}>{(viewport.zoom * 100).toFixed(0)}%</span>
          <button style={styles.button} onClick={onZoomIn} title="Zoom in">
            +
          </button>
          <button style={styles.button} onClick={onResetView} title="Reset view (100%)">
            ⟳
          </button>
          <button style={styles.button} onClick={onFitAll} title="Fit all content">
            ⊞
          </button>

          <div style={styles.separator} />

          {/* Grid snap toggle */}
          <button
            style={{
              ...styles.button,
              ...(gridSnapEnabled ? styles.buttonActive : {}),
            }}
            onClick={onToggleGridSnap}
            title={`Grid snap: ${gridSnapEnabled ? 'ON' : 'OFF'}`}
          >
            #
          </button>

          <div style={styles.separator} />

          {/* Undo / Redo */}
          <button
            style={{ ...styles.button, ...(canUndo ? {} : styles.buttonDisabled) }}
            onClick={onUndo}
            disabled={!canUndo}
            title={undoLabel ? `Undo: ${undoLabel}` : 'Undo (Ctrl+Z)'}
          >
            ↶
          </button>
          <button
            style={{ ...styles.button, ...(canRedo ? {} : styles.buttonDisabled) }}
            onClick={onRedo}
            disabled={!canRedo}
            title={redoLabel ? `Redo: ${redoLabel}` : 'Redo (Ctrl+Y)'}
          >
            ↷
          </button>

          <div style={styles.separator} />

          {/* Help */}
          <button style={styles.button} onClick={toggleHelp} title="Keyboard shortcuts (?)">
            ?
          </button>
        </div>
      </div>

      {helpVisible && <HelpOverlay onClose={() => setHelpVisible(false)} />}
    </>
  );
};

// ---------------------------------------------------------------
// Styles
// ---------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 100,
    background: 'rgba(22, 33, 62, 0.92)',
    borderRadius: 8,
    padding: '6px 10px',
    border: '1px solid #0f3460',
    backdropFilter: 'blur(6px)',
    userSelect: 'none',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  button: {
    width: 30,
    height: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    background: '#1a1a2e',
    color: '#eaeaea',
    border: '1px solid #0f3460',
    borderRadius: 6,
    cursor: 'pointer',
    lineHeight: 1,
    padding: 0,
    fontFamily: 'monospace',
  },
  buttonActive: {
    background: '#0f3460',
    borderColor: '#53a8b6',
    color: '#53a8b6',
  },
  buttonDisabled: {
    opacity: 0.35,
    cursor: 'default',
  },
  zoomLabel: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#8888aa',
    minWidth: 40,
    textAlign: 'center',
  },
  separator: {
    width: 1,
    height: 20,
    background: '#0f3460',
    margin: '0 4px',
  },
};
