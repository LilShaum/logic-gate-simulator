// ============================================================
// CreateBlockDialog — modal dialog for naming a new custom block
// ============================================================

import { useState, useRef, useEffect } from 'react';

const ICON_OPTIONS = ['⚡', '🔧', '⚙️', '🧩', '📦', '🔲', '🎯', '💡', '🔌', '🛠️'];

interface CreateBlockDialogProps {
  visible: boolean;
  /** Number of detected input ports */
  inputCount: number;
  /** Number of detected output ports */
  outputCount: number;
  onCreate: (name: string, description: string, icon: string) => void;
  onCancel: () => void;
}

export const CreateBlockDialog: React.FC<CreateBlockDialogProps> = ({
  visible,
  inputCount,
  outputCount,
  onCreate,
  onCancel,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('⚡');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus name input when dialog opens
  useEffect(() => {
    if (visible) {
      setName('');
      setDescription('');
      setIcon('⚡');
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [visible]);

  if (!visible) return null;

  const canCreate = name.trim().length > 0 && (inputCount > 0 || outputCount > 0);

  const handleSubmit = () => {
    if (canCreate) {
      onCreate(name.trim(), description.trim(), icon);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>Create Custom Block</div>

        {/* Port info */}
        <div style={styles.portInfo}>
          <span style={styles.portBadge}>
            {inputCount} input{inputCount !== 1 ? 's' : ''}
          </span>
          <span style={styles.portBadge}>
            {outputCount} output{outputCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Name */}
        <label style={styles.label}>Name *</label>
        <input
          ref={nameInputRef}
          style={styles.input}
          type="text"
          placeholder="e.g. Half Adder"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={30}
        />

        {/* Description */}
        <label style={styles.label}>Description</label>
        <input
          style={styles.input}
          type="text"
          placeholder="e.g. Computes sum and carry"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={80}
        />

        {/* Icon picker */}
        <label style={styles.label}>Icon</label>
        <div style={styles.iconRow}>
          {ICON_OPTIONS.map((emoji) => (
            <button
              key={emoji}
              style={{
                ...styles.iconBtn,
                ...(icon === emoji ? styles.iconBtnActive : {}),
              }}
              onClick={() => setIcon(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Buttons */}
        <div style={styles.buttonRow}>
          <button style={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button
            style={{
              ...styles.createBtn,
              opacity: canCreate ? 1 : 0.4,
            }}
            onClick={handleSubmit}
            disabled={!canCreate}
          >
            Create Block
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------
// Styles
// ---------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 500,
  },
  dialog: {
    background: 'rgba(22, 33, 62, 0.98)',
    border: '1px solid #0f3460',
    borderRadius: 10,
    padding: '20px 24px',
    width: 340,
    maxHeight: '80vh',
    overflow: 'auto',
    fontFamily: 'monospace',
    color: '#eaeaea',
  },
  header: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#eaeaea',
  },
  portInfo: {
    display: 'flex',
    gap: 8,
    marginBottom: 12,
  },
  portBadge: {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 4,
    background: '#0f3460',
    color: '#8888aa',
  },
  label: {
    display: 'block',
    fontSize: 11,
    color: '#8888aa',
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    width: '100%',
    padding: '6px 10px',
    fontSize: 13,
    fontFamily: 'monospace',
    background: '#1a1a2e',
    color: '#eaeaea',
    border: '1px solid #0f3460',
    borderRadius: 4,
    outline: 'none',
    boxSizing: 'border-box',
  },
  iconRow: {
    display: 'flex',
    gap: 4,
    marginTop: 4,
  },
  iconBtn: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    background: '#1a1a2e',
    border: '1px solid #0f3460',
    borderRadius: 4,
    cursor: 'pointer',
    padding: 0,
  },
  iconBtnActive: {
    background: '#0f3460',
    borderColor: '#53a8b6',
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
  cancelBtn: {
    padding: '6px 14px',
    fontSize: 12,
    fontFamily: 'monospace',
    background: '#1a1a2e',
    color: '#8888aa',
    border: '1px solid #0f3460',
    borderRadius: 4,
    cursor: 'pointer',
  },
  createBtn: {
    padding: '6px 14px',
    fontSize: 12,
    fontFamily: 'monospace',
    background: '#0f3460',
    color: '#eaeaea',
    border: '1px solid #53a8b6',
    borderRadius: 4,
    cursor: 'pointer',
  },
};
