// ============================================================
// SimulationControls — play / pause / step / reset / speed UI
// ============================================================

import type { SimulationMode, SimulationSpeed } from '@/types/circuit';

const SPEED_OPTIONS: { value: SimulationSpeed; label: string }[] = [
  { value: 'slow', label: '0.5x' },
  { value: 'normal', label: '1x' },
  { value: 'fast', label: '5x' },
];

interface SimulationControlsProps {
  mode: SimulationMode;
  speed: SimulationSpeed;
  tick: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStep: () => void;
  onReset: () => void;
  onSpeedChange: (speed: SimulationSpeed) => void;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  mode,
  speed,
  tick,
  onStart,
  onPause,
  onResume,
  onStep,
  onReset,
  onSpeedChange,
}) => {
  const handlePlayPause = () => {
    if (mode === 'stopped') {
      onStart();
    } else if (mode === 'running') {
      onPause();
    } else {
      onResume();
    }
  };

  const playPauseLabel = mode === 'running' ? '⏸' : '▶';
  const playPauseTitle = mode === 'running'
    ? 'Pause simulation'
    : mode === 'paused'
      ? 'Resume simulation'
      : 'Start simulation';

  return (
    <div style={styles.container}>
      <div style={styles.row}>
        {/* Play / Pause */}
        <button
          style={{
            ...styles.button,
            ...(mode === 'running' ? styles.buttonActive : {}),
          }}
          onClick={handlePlayPause}
          title={playPauseTitle}
        >
          {playPauseLabel}
        </button>

        {/* Single Step */}
        <button
          style={styles.button}
          onClick={onStep}
          title="Single step"
          disabled={mode === 'running'}
        >
          ⏭
        </button>

        {/* Reset */}
        <button
          style={styles.button}
          onClick={onReset}
          title="Reset simulation"
        >
          ⏹
        </button>

        {/* Speed selector */}
        <div style={styles.speedGroup}>
          {SPEED_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              style={{
                ...styles.speedBtn,
                ...(speed === opt.value ? styles.speedBtnActive : {}),
              }}
              onClick={() => onSpeedChange(opt.value)}
              title={`Speed: ${opt.label}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Tick counter */}
        <span style={styles.tickLabel}>T:{tick}</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------
// Inline styles (matching dark theme)
// ---------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: 12,
    left: 12,
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
    gap: 6,
  },
  button: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    background: '#1a1a2e',
    color: '#eaeaea',
    border: '1px solid #0f3460',
    borderRadius: 6,
    cursor: 'pointer',
    lineHeight: 1,
    padding: 0,
  },
  buttonActive: {
    background: '#0f3460',
    borderColor: '#00e676',
  },
  speedGroup: {
    display: 'flex',
    gap: 2,
    marginLeft: 6,
    border: '1px solid #0f3460',
    borderRadius: 6,
    overflow: 'hidden',
  },
  speedBtn: {
    padding: '4px 8px',
    fontSize: 11,
    fontFamily: 'monospace',
    background: '#1a1a2e',
    color: '#8888aa',
    border: 'none',
    cursor: 'pointer',
  },
  speedBtnActive: {
    background: '#0f3460',
    color: '#00e676',
  },
  tickLabel: {
    marginLeft: 8,
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#8888aa',
  },
};
