// ============================================================
// StatusBar — bottom status bar showing zoom, grid, simulation, selection info
// ============================================================

import type { SimulationMode, SimulationSpeed, Viewport } from '@/types/circuit';

interface StatusBarProps {
  viewport: Viewport;
  gridSnapEnabled: boolean;
  simulationMode: SimulationMode;
  simulationSpeed: SimulationSpeed;
  simulationTick: number;
  selectionCount: number;
  gateCount: number;
  wireCount: number;
  /** Circuit failed to settle */
  oscillating?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  viewport,
  gridSnapEnabled,
  simulationMode,
  simulationSpeed,
  simulationTick,
  selectionCount,
  gateCount,
  wireCount,
  oscillating = false,
}) => {
  const zoomPercent = (viewport.zoom * 100).toFixed(0);

  const modeColors: Record<SimulationMode, string> = {
    stopped: '#8b9ac0',
    running: '#3ddc97',
    paused: '#ffb454',
  };

  const modeLabels: Record<SimulationMode, string> = {
    stopped: 'STOPPED',
    running: 'RUNNING',
    paused: 'PAUSED',
  };

  const speedLabels: Record<SimulationSpeed, string> = {
    slow: '0.5x',
    normal: '1x',
    fast: '5x',
  };

  return (
    <div
      className="status-bar"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        background: 'rgba(18, 26, 45, 0.92)',
        borderTop: '1px solid #2a3a5c',
        backdropFilter: 'blur(6px)',
        fontSize: 10,
        fontFamily: 'var(--mono)',
        color: '#5d6a8a',
        userSelect: 'none',
        zIndex: 50,
        gap: 12,
      }}
    >
      {/* Left section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Zoom */}
        <StatusItem label="Zoom" value={`${zoomPercent}%`} />

        {/* Grid */}
        <StatusItem
          label="Grid"
          value={gridSnapEnabled ? 'Snap' : 'Free'}
          valueColor={gridSnapEnabled ? '#58b6ff' : '#8b9ac0'}
        />

        {/* Divider */}
        <div style={{ width: 1, height: 12, background: '#2a3a5c' }} />

        {/* Circuit stats */}
        <StatusItem label="Gates" value={String(gateCount)} />
        <StatusItem label="Wires" value={String(wireCount)} />
      </div>

      {/* Center section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {selectionCount > 0 && (
          <StatusItem label="Selected" value={`${selectionCount}`} valueColor="#58b6ff" />
        )}
        {oscillating && (
          <span style={{ color: '#ffb454', fontWeight: 600 }}>
            ⚠ circuit never settled
          </span>
        )}
      </div>

      {/* Right section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Simulation state */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: modeColors[simulationMode],
            display: 'inline-block',
            boxShadow: simulationMode === 'running' ? `0 0 4px ${modeColors[simulationMode]}` : 'none',
          }} />
          <span style={{ color: modeColors[simulationMode], fontWeight: 'bold' }}>
            {modeLabels[simulationMode]}
          </span>
          {simulationMode !== 'stopped' && (
            <span style={{ color: '#5d6a8a', marginLeft: 2 }}>
              {speedLabels[simulationSpeed]}
            </span>
          )}
        </div>

        {simulationMode !== 'stopped' && (
          <>
            <div style={{ width: 1, height: 12, background: '#2a3a5c' }} />
            <StatusItem label="Tick" value={String(simulationTick)} />
          </>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------
// Status item sub-component
// ---------------------------------------------------------------

const StatusItem: React.FC<{
  label: string;
  value: string;
  valueColor?: string;
}> = ({ label, value, valueColor }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
    <span style={{ color: '#5d6a8a' }}>{label}:</span>
    <span style={{ color: valueColor ?? '#8b9ac0' }}>{value}</span>
  </div>
);
