// ============================================================
// UI theme — one place for the colours the chrome shares with
// the canvas renderer.
// ============================================================

export const theme = {
  bg: '#0b1020',
  panel: 'rgba(18, 26, 45, 0.92)',
  panelSolid: '#121a2d',
  panelBorder: '#2a3a5c',
  divider: '#1e2942',

  text: '#e6ecf7',
  textDim: '#8b9ac0',
  textFaint: '#5d6a8a',

  accent: '#58b6ff',
  accentDim: 'rgba(88, 182, 255, 0.15)',
  high: '#3ddc97',
  low: '#4a5872',
  warn: '#ffb454',
  danger: '#ff6b6b',

  gridMinor: '#151d33',
  gridMajor: '#1f2b47',

  radius: 8,
  radiusSm: 5,
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  sans: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
} as const;

/** Shared style for a floating panel of chrome */
export const panelStyle: React.CSSProperties = {
  background: theme.panel,
  border: `1px solid ${theme.panelBorder}`,
  borderRadius: theme.radius,
  backdropFilter: 'blur(10px)',
  boxShadow: '0 6px 24px rgba(0, 0, 0, 0.45)',
  userSelect: 'none',
};

/** Shared style for a small chrome button */
export const buttonStyle: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: 11,
  fontFamily: theme.mono,
  background: 'transparent',
  color: theme.textDim,
  border: `1px solid ${theme.panelBorder}`,
  borderRadius: theme.radiusSm,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
