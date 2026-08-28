// ============================================================
// SimulationControls — play / pause / step / reset / speed UI
//   Modern design with tooltips, grouped buttons, transitions
// ============================================================

import type { SimulationMode, SimulationSpeed } from '@/types/circuit';
import { TooltipButton } from './Tooltip';

const SPEED_OPTIONS: { value: SimulationSpeed; label: string; title: string }[] = [
  { value: 'slow', label: '0.5x', title: 'Slow speed (0.5x)' },
  { value: 'normal', label: '1x', title: 'Normal speed (1x)' },
  { value: 'fast', label: '5x', title: 'Fast speed (5x)' },
];

interface SimulationControlsProps {
  mode: SimulationMode;
  speed: SimulationSpeed;
  tick: number;
  /** Set when the circuit never settled — usually an unbuffered feedback loop */
  oscillating?: boolean;
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
  oscillating = false,
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
        {/* Group: Playback */}
        <div style={styles.group}>
          <TooltipButton
            tooltip={playPauseTitle}
            style={{
              ...styles.button,
              ...(mode === 'running' ? styles.buttonActive : {}),
            }}
            onClick={handlePlayPause}
          >
            {playPauseLabel}
          </TooltipButton>

          <TooltipButton
            tooltip="Single step"
            style={styles.button}
            onClick={onStep}
            disabled={mode === 'running'}
          >
            ⏭
          </TooltipButton>

          <TooltipButton
            tooltip="Reset simulation"
            style={styles.button}
            onClick={onReset}
          >
            ⏹
          </TooltipButton>
        </div>

        {/* Separator */}
        <div style={styles.separator} />

        {/* Group: Speed */}
        <div style={styles.speedGroup}>
          {SPEED_OPTIONS.map((opt) => (
            <TooltipButton
              key={opt.value}
              tooltip={opt.title}
              style={{
                ...styles.speedBtn,
                ...(speed === opt.value ? styles.speedBtnActive : {}),
              }}
              onClick={() => onSpeedChange(opt.value)}
            >
              {opt.label}
            </TooltipButton>
          ))}
        </div>

        {/* Tick counter */}
        <span style={styles.tickLabel}>T:{tick}</span>

        {oscillating && (
          <span
            style={styles.oscillating}
            title="The circuit never settled. A feedback loop needs a flip-flop or an inverter chain with an odd number of stages."
          >
            ⚠ UNSTABLE
          </span>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------
// Styles
// ---------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 100,
    background: 'rgba(18, 26, 45, 0.92)',
    borderRadius: 10,
    padding: '5px 8px',
    border: '1px solid #2a3a5c',
    backdropFilter: 'blur(8px)',
    userSelect: 'none',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(15,52,96,0.2)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
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
    fontSize: 14,
    background: 'rgba(0,0,0,0.25)',
    color: '#e6ecf7',
    border: '1px solid #2a3a5c',
    borderRadius: 5,
    cursor: 'pointer',
    lineHeight: 1,
    padding: 0,
    fontFamily: 'var(--mono)',
    transition: 'all 0.12s ease',
  },
  buttonActive: {
    background: 'rgba(61, 220, 151, 0.14)',
    borderColor: '#3ddc97',
    color: '#3ddc97',
  },
  separator: {
    width: 1,
    height: 20,
    background: 'linear-gradient(to bottom, transparent, #2a3a5c, transparent)',
    margin: '0 2px',
  },
  speedGroup: {
    display: 'flex',
    gap: 1,
    border: '1px solid #2a3a5c',
    borderRadius: 5,
    overflow: 'hidden',
  },
  speedBtn: {
    padding: '3px 7px',
    fontSize: 10,
    fontFamily: 'var(--mono)',
    background: 'rgba(0,0,0,0.25)',
    color: '#5d6a8a',
    border: 'none',
    borderRight: '1px solid #2a3a5c',
    cursor: 'pointer',
    transition: 'all 0.12s ease',
    height: 26,
  },
  speedBtnActive: {
    background: 'rgba(88, 182, 255, 0.16)',
    color: '#58b6ff',
  },
  tickLabel: {
    marginLeft: 4,
    fontSize: 10,
    fontFamily: 'var(--mono)',
    color: '#5d6a8a',
  },
  oscillating: {
    marginLeft: 6,
    padding: '3px 7px',
    fontSize: 10,
    fontFamily: 'var(--mono)',
    color: '#ffb454',
    background: 'rgba(255, 180, 84, 0.12)',
    border: '1px solid rgba(255, 180, 84, 0.5)',
    borderRadius: 4,
    cursor: 'help',
  },
};
