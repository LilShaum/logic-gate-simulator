// ============================================================
// Toolbar — modern design with grouped sections, tooltips,
//           keyboard shortcuts help overlay, CSS transitions
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import type { Viewport } from '@/types/circuit';
import { TooltipButton } from './Tooltip';

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
    { keys: 'Arrow keys', desc: 'Nudge selected (1px)' },
    { keys: 'Shift + Arrow', desc: 'Nudge selected (10px)' },
  ]},
  { category: 'Wiring', items: [
    { keys: 'Click output port', desc: 'Start wire' },
    { keys: 'Click input port', desc: 'Connect wire' },
    { keys: 'Escape', desc: 'Cancel wire' },
  ]},
  { category: 'Placing Gates', items: [
    { keys: 'Click gate in palette', desc: 'Click-to-place mode' },
    { keys: 'Click canvas', desc: 'Place selected gate' },
    { keys: 'Drag gate from palette', desc: 'Drag-and-drop to place' },
    { keys: 'Escape', desc: 'Cancel placement' },
  ]},
  { category: 'Other', items: [
    { keys: '? button / ? key', desc: 'Toggle this help' },
    { keys: 'Right-click', desc: 'Context menu' },
  ]},
];

// ---------------------------------------------------------------
// Help overlay component
// ---------------------------------------------------------------

const HelpOverlay: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div
    className="overlay-backdrop"
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
      className="overlay-panel"
      style={{
        background: 'rgba(12, 20, 40, 0.98)',
        border: '1px solid #1a3050',
        borderRadius: 12,
        padding: '20px 28px',
        maxWidth: 540,
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto',
        color: '#eaeaea',
        fontFamily: 'monospace',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(15,52,96,0.3)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 15, color: '#53a8b6', fontWeight: 'bold' }}>
          Keyboard Shortcuts
        </h2>
        <button
          style={{
            background: 'rgba(15, 52, 96, 0.4)',
            border: '1px solid #1a3050',
            color: '#8888aa',
            fontSize: 11,
            cursor: 'pointer',
            borderRadius: 4,
            padding: '3px 8px',
            fontFamily: 'monospace',
            transition: 'all 0.12s ease',
          }}
          onClick={onClose}
        >
          ESC
        </button>
      </div>
      {SHORTCUTS.map((section) => (
        <div key={section.category} style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 10,
            color: '#53a8b6',
            fontWeight: 'bold',
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
          }}>
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
                borderBottom: '1px solid rgba(15,52,96,0.3)',
              }}
            >
              <span style={{ color: '#ffb347', fontSize: 11 }}>{item.keys}</span>
              <span style={{ color: '#999' }}>{item.desc}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
);

// ---------------------------------------------------------------
// Toolbar group separator
// ---------------------------------------------------------------

const GroupSeparator: React.FC = () => (
  <div style={{
    width: 1,
    height: 22,
    background: 'linear-gradient(to bottom, transparent, #1a3050, transparent)',
    margin: '0 4px',
  }} />
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
          {/* Group: View controls */}
          <div style={styles.group}>
            <TooltipButton tooltip="Zoom out" shortcut="-" style={styles.button} onClick={onZoomOut}>
              −
            </TooltipButton>
            <span style={styles.zoomLabel}>{(viewport.zoom * 100).toFixed(0)}%</span>
            <TooltipButton tooltip="Zoom in" shortcut="+" style={styles.button} onClick={onZoomIn}>
              +
            </TooltipButton>
            <TooltipButton tooltip="Reset view" shortcut="0" style={styles.button} onClick={onResetView}>
              ⟳
            </TooltipButton>
            <TooltipButton tooltip="Fit all content" shortcut="F" style={styles.button} onClick={onFitAll}>
              ⊞
            </TooltipButton>
          </div>

          <GroupSeparator />

          {/* Group: Grid */}
          <div style={styles.group}>
            <TooltipButton
              tooltip={`Grid snap: ${gridSnapEnabled ? 'ON' : 'OFF'}`}
              shortcut="G"
              style={{
                ...styles.button,
                ...(gridSnapEnabled ? styles.buttonActive : {}),
              }}
              onClick={onToggleGridSnap}
            >
              #
            </TooltipButton>
          </div>

          <GroupSeparator />

          {/* Group: Undo / Redo */}
          <div style={styles.group}>
            <TooltipButton
              tooltip={undoLabel ? `Undo: ${undoLabel}` : 'Undo'}
              shortcut="Ctrl+Z"
              style={{ ...styles.button, ...(canUndo ? {} : styles.buttonDisabled) }}
              disabled={!canUndo}
              onClick={onUndo}
            >
              ↶
            </TooltipButton>
            <TooltipButton
              tooltip={redoLabel ? `Redo: ${redoLabel}` : 'Redo'}
              shortcut="Ctrl+Y"
              style={{ ...styles.button, ...(canRedo ? {} : styles.buttonDisabled) }}
              disabled={!canRedo}
              onClick={onRedo}
            >
              ↷
            </TooltipButton>
          </div>

          <GroupSeparator />

          {/* Group: Help */}
          <div style={styles.group}>
            <TooltipButton
              tooltip="Keyboard shortcuts"
              shortcut="?"
              style={styles.button}
              onClick={toggleHelp}
            >
              ?
            </TooltipButton>
          </div>
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
    bottom: 36,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 100,
    background: 'rgba(10, 15, 30, 0.94)',
    borderRadius: 10,
    padding: '5px 8px',
    border: '1px solid #1a3050',
    backdropFilter: 'blur(8px)',
    userSelect: 'none',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(15,52,96,0.2)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  group: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  button: {
    width: 30,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    background: '#111a30',
    color: '#c0c0d0',
    border: '1px solid #1a3050',
    borderRadius: 5,
    cursor: 'pointer',
    lineHeight: 1,
    padding: 0,
    fontFamily: 'monospace',
    transition: 'all 0.12s ease',
  },
  buttonActive: {
    background: 'rgba(83, 168, 182, 0.15)',
    borderColor: '#53a8b6',
    color: '#53a8b6',
  },
  buttonDisabled: {
    opacity: 0.3,
    cursor: 'default',
  },
  zoomLabel: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#666',
    minWidth: 36,
    textAlign: 'center',
  },
};
