// ============================================================
// CircuitMenu — name the circuit, save it, reopen it, move it
// between machines as a .json file.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import type { SavedEntry } from '@/utils/persistence';
import { deleteNamed, listSaved } from '@/utils/persistence';
import { buttonStyle, panelStyle, theme } from '@/theme';

interface CircuitMenuProps {
  name: string;
  dirty: boolean;
  onRename: (name: string) => void;
  onNew: () => void;
  onSave: () => void;
  onOpen: (name: string) => void;
  onExport: () => void;
  onImport: () => void;
}

const relativeTime = (ts: number): string => {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

export const CircuitMenu: React.FC<CircuitMenuProps> = ({
  name,
  dirty,
  onRename,
  onNew,
  onSave,
  onOpen,
  onExport,
  onImport,
}) => {
  const [open, setOpen] = useState(false);
  const [saves, setSaves] = useState<SavedEntry[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setSaves(listSaved());
  }, [open]);

  // Close the dropdown on an outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      style={{
        ...panelStyle,
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 130,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 6px',
      }}
    >
      <input
        value={name}
        onChange={(e) => onRename(e.target.value)}
        spellCheck={false}
        aria-label="Circuit name"
        style={{
          width: 168,
          padding: '4px 8px',
          fontSize: 12,
          fontFamily: theme.sans,
          fontWeight: 500,
          background: 'transparent',
          color: theme.text,
          border: '1px solid transparent',
          borderRadius: theme.radiusSm,
          outline: 'none',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = theme.panelBorder;
          e.currentTarget.style.background = 'rgba(0,0,0,0.25)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'transparent';
          e.currentTarget.style.background = 'transparent';
        }}
      />

      <span
        title={dirty ? 'Unsaved changes' : 'Saved'}
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: dirty ? theme.warn : theme.high,
          flexShrink: 0,
        }}
      />

      <div style={{ width: 1, height: 18, background: theme.divider }} />

      <button style={buttonStyle} onClick={onSave} title="Save to this browser (Ctrl+S)">
        Save
      </button>
      <button style={buttonStyle} onClick={() => setOpen((v) => !v)} title="Open a saved circuit">
        Open ▾
      </button>
      <button style={buttonStyle} onClick={onExport} title="Download as .json">
        Export
      </button>
      <button style={buttonStyle} onClick={onImport} title="Load a .json file">
        Import
      </button>
      <button style={buttonStyle} onClick={onNew} title="Start an empty circuit">
        New
      </button>

      {open && (
        <div
          style={{
            ...panelStyle,
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            maxHeight: 260,
            overflowY: 'auto',
            padding: 4,
          }}
        >
          {saves.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: '10px 12px',
                fontFamily: theme.sans,
                fontSize: 11,
                color: theme.textDim,
              }}
            >
              Nothing saved yet. Hit Save to keep this circuit in your browser.
            </p>
          ) : (
            saves.map((s) => (
              <div
                key={s.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 6px',
                  borderRadius: theme.radiusSm,
                }}
              >
                <button
                  onClick={() => {
                    onOpen(s.name);
                    setOpen(false);
                  }}
                  style={{
                    ...buttonStyle,
                    flex: 1,
                    border: 'none',
                    textAlign: 'left',
                    color: theme.text,
                    fontFamily: theme.sans,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {s.name}
                  <span style={{ color: theme.textFaint, marginLeft: 8, fontSize: 10 }}>
                    {relativeTime(s.savedAt)}
                  </span>
                </button>
                <button
                  title={`Delete "${s.name}"`}
                  onClick={() => {
                    deleteNamed(s.name);
                    setSaves(listSaved());
                  }}
                  style={{ ...buttonStyle, border: 'none', color: theme.danger, padding: '2px 6px' }}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
