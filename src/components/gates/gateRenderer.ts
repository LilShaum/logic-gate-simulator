import type { Gate, GateConfig, Viewport } from '@/types/circuit';

// ---------------------------------------------------------------
// Color palette for gates — polished, modern look
// ---------------------------------------------------------------
export const GATE_COLORS = {
  body: '#16213e',
  bodyGradientTop: '#1e2d4a',
  bodyGradientBottom: '#111a30',
  border: '#2a3f6a',
  borderSelected: '#e94560',
  borderHover: '#53a8b6',
  text: '#eaeaea',
  textDim: '#8899bb',
  portDot: '#53a8b6',
  portActive: '#00e676',
  portInactive: '#3a3a5c',
  portRing: '#0a0a1a',
  outputHigh: '#00e676',
  outputLow: '#3a3a5c',
  inputHigh: '#00e676',
  inputLow: '#3a3a5c',
  // Signal LED on gate body
  signalHigh: '#00e676',
  signalLow: '#3a3a5c',
  signalGlow: 'rgba(0, 230, 118, 0.35)',
  // Selection / hover
  selectionGlow: 'rgba(233, 69, 96, 0.45)',
  hoverGlow: 'rgba(83, 168, 182, 0.25)',
  // I/O specific colors
  switchOn: '#00e676',
  switchOff: '#e94560',
  ledOn: '#00e676',
  ledOff: '#3a3a5c',
  ledGlow: 'rgba(0, 230, 118, 0.4)',
  constantHigh: '#00e676',
  constantLow: '#e94560',
  // Port hover / interaction colors
  portHover: '#88ddff',
  portValid: '#00e676',
  portInvalid: '#e94560',
  portSnapGlow: 'rgba(83, 168, 182, 0.5)',
};

// ---------------------------------------------------------------
// Shared drawing helpers
// ---------------------------------------------------------------

/** Create a body gradient (top-to-bottom subtle highlight) */
const createBodyGradient = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
): CanvasGradient => {
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, GATE_COLORS.bodyGradientTop);
  grad.addColorStop(1, GATE_COLORS.bodyGradientBottom);
  return grad;
};

/** Draw selection glow (behind gate) */
const drawSelectionGlow = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number,
) => {
  ctx.save();
  ctx.shadowColor = GATE_COLORS.selectionGlow;
  ctx.shadowBlur = 18 * zoom;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.beginPath();
  ctx.roundRect(x - 2 * zoom, y - 2 * zoom, w + 4 * zoom, h + 4 * zoom, 8 * zoom);
  ctx.fillStyle = 'rgba(233, 69, 96, 0.08)';
  ctx.fill();
  ctx.restore();
};

/** Draw hover elevation effect */
const drawHoverGlow = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number,
) => {
  ctx.save();
  ctx.shadowColor = GATE_COLORS.hoverGlow;
  ctx.shadowBlur = 12 * zoom;
  ctx.shadowOffsetY = 2 * zoom;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6 * zoom);
  ctx.fillStyle = 'rgba(83, 168, 182, 0.05)';
  ctx.fill();
  ctx.restore();
};

/** Draw a subtle drop shadow under a gate body */
const drawDropShadow = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number,
) => {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 6 * zoom;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 3 * zoom;
  // Draw a filled rect just for the shadow
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6 * zoom);
  ctx.fillStyle = 'rgba(0,0,0,0.01)';
  ctx.fill();
  ctx.restore();
};

/** Draw a small signal-state LED indicator on the gate body */
const drawSignalLed = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  zoom: number,
  active: boolean,
) => {
  const r = 3 * zoom;
  // Glow when high
  if (active) {
    const glowR = r * 3;
    const glow = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, glowR);
    glow.addColorStop(0, GATE_COLORS.signalGlow);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = active ? GATE_COLORS.signalHigh : GATE_COLORS.signalLow;
  ctx.fill();
  ctx.strokeStyle = GATE_COLORS.portRing;
  ctx.lineWidth = 0.8;
  ctx.stroke();
};

// ---------------------------------------------------------------
// Port position calculation
// ---------------------------------------------------------------

/** Get the world-space position of a port on a gate */
export const getPortWorldPosition = (
  gate: Gate,
  config: GateConfig,
  portIndex: number,
  isInput: boolean,
): { x: number; y: number } => {
  const ports = isInput ? config.inputs : config.outputs;
  if (portIndex >= ports.length) {
    return { x: gate.position.x, y: gate.position.y };
  }
  const port = ports[portIndex];
  return {
    x: gate.position.x + port.offset.x,
    y: gate.position.y + port.offset.y,
  };
};

// ---------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------

/** Check if a world-space point is inside a gate's bounding box */
export const isPointInGate = (
  px: number,
  py: number,
  gate: Gate,
  config: GateConfig,
): boolean => {
  return (
    px >= gate.position.x &&
    px <= gate.position.x + config.width &&
    py >= gate.position.y &&
    py <= gate.position.y + config.height
  );
};

/** Check if a world-space point is near a port (within radius) */
export const isPointNearPort = (
  px: number,
  py: number,
  gate: Gate,
  config: GateConfig,
  portIndex: number,
  isInput: boolean,
  zoom: number,
): boolean => {
  const pos = getPortWorldPosition(gate, config, portIndex, isInput);
  // Larger hit radius for input (square) and output (circle) ports
  const radius = isInput ? 10 / zoom : 10 / zoom;
  const dx = px - pos.x;
  const dy = py - pos.y;
  return dx * dx + dy * dy <= radius * radius;
};

// ---------------------------------------------------------------
// Drawing helpers — ports
// ---------------------------------------------------------------

/** Drawing parameters for port state during connection mode */
export interface PortDrawState {
  /** Whether this port is being hovered */
  hovered?: boolean;
  /** Highlight state: 'valid' = green glow, 'invalid' = red glow, undefined = no highlight */
  highlight?: 'valid' | 'invalid';
  /** Whether this port is a magnetic snap target (shows glow ring) */
  snapTarget?: boolean;
}

/** Draw a single input port (square-ish shape with rounded corners) */
const drawInputPort = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  zoom: number,
  active: boolean,
  state?: PortDrawState,
) => {
  const baseSize = 9 * zoom;
  const isHovered = state?.hovered ?? false;
  const size = isHovered ? baseSize * 1.35 : baseSize;

  // Snap target glow ring
  if (state?.snapTarget) {
    ctx.save();
    ctx.shadowColor = GATE_COLORS.portSnapGlow;
    ctx.shadowBlur = 14 * zoom;
    ctx.beginPath();
    ctx.roundRect(cx - size - 3 * zoom, cy - size - 3 * zoom, (size + 3 * zoom) * 2, (size + 3 * zoom) * 2, 3 * zoom);
    ctx.strokeStyle = GATE_COLORS.portSnapGlow;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // Highlight ring (valid/invalid)
  if (state?.highlight) {
    ctx.save();
    const hlColor = state.highlight === 'valid' ? GATE_COLORS.portValid : GATE_COLORS.portInvalid;
    ctx.shadowColor = hlColor;
    ctx.shadowBlur = 10 * zoom;
    ctx.beginPath();
    ctx.roundRect(cx - size - 2 * zoom, cy - size - 2 * zoom, (size + 2 * zoom) * 2, (size + 2 * zoom) * 2, 3 * zoom);
    ctx.strokeStyle = hlColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // Outer ring (dark border)
  ctx.beginPath();
  ctx.roundRect(cx - size - 1.5 * zoom, cy - size - 1.5 * zoom, (size + 1.5 * zoom) * 2, (size + 1.5 * zoom) * 2, 2 * zoom);
  ctx.fillStyle = GATE_COLORS.portRing;
  ctx.fill();

  // Inner square (with rounded corners for polished look)
  ctx.beginPath();
  ctx.roundRect(cx - size, cy - size, size * 2, size * 2, 2 * zoom);
  ctx.fillStyle = active ? GATE_COLORS.portActive : GATE_COLORS.portDot;
  ctx.fill();

  // Subtle inner highlight (top-left)
  ctx.beginPath();
  ctx.roundRect(cx - size * 0.6, cy - size * 0.6, size * 0.5, size * 0.5, 1 * zoom);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fill();
};

/** Draw a single output port (circle shape) */
const drawOutputPort = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  zoom: number,
  active: boolean,
  state?: PortDrawState,
) => {
  const baseR = 5 * zoom;
  const isHovered = state?.hovered ?? false;
  const r = isHovered ? baseR * 1.35 : baseR;

  // Snap target glow ring
  if (state?.snapTarget) {
    ctx.save();
    ctx.shadowColor = GATE_COLORS.portSnapGlow;
    ctx.shadowBlur = 14 * zoom;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5 * zoom, 0, Math.PI * 2);
    ctx.strokeStyle = GATE_COLORS.portSnapGlow;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // Highlight ring (valid/invalid)
  if (state?.highlight) {
    ctx.save();
    const hlColor = state.highlight === 'valid' ? GATE_COLORS.portValid : GATE_COLORS.portInvalid;
    ctx.shadowColor = hlColor;
    ctx.shadowBlur = 10 * zoom;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4 * zoom, 0, Math.PI * 2);
    ctx.strokeStyle = hlColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1.5 * zoom, 0, Math.PI * 2);
  ctx.fillStyle = GATE_COLORS.portRing;
  ctx.fill();

  // Inner circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = active ? GATE_COLORS.portActive : GATE_COLORS.portDot;
  ctx.fill();

  // Subtle inner highlight
  ctx.beginPath();
  ctx.arc(cx - r * 0.2, cy - r * 0.25, r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fill();
};

/** Draw a port with label — dispatches to input (square) or output (circle) shape */
const drawPortDot = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  zoom: number,
  active: boolean,
  isInput: boolean,
  label?: string,
  labelSide?: 'left' | 'right',
  state?: PortDrawState,
) => {
  if (isInput) {
    drawInputPort(ctx, cx, cy, zoom, active, state);
  } else {
    drawOutputPort(ctx, cx, cy, zoom, active, state);
  }

  // Port label
  if (label) {
    ctx.fillStyle = state?.hovered ? GATE_COLORS.portHover : GATE_COLORS.textDim;
    ctx.font = `${(state?.hovered ? 8 : 7) * zoom}px monospace`;
    ctx.textBaseline = 'middle';
    if (labelSide === 'left') {
      ctx.textAlign = 'right';
      const offset = isInput ? (state?.hovered ? 13 : 11) : (state?.hovered ? 11 : 9);
      ctx.fillText(label, cx - offset * zoom, cy);
    } else {
      ctx.textAlign = 'left';
      const offset = isInput ? (state?.hovered ? 9 : 7) : (state?.hovered ? 13 : 11);
      ctx.fillText(label, cx + offset * zoom, cy);
    }
  }
};

/** Draw all ports for a gate in canvas coordinates */
const drawPorts = (
  ctx: CanvasRenderingContext2D,
  gate: Gate,
  config: GateConfig,
  vp: Viewport,
  inputStates: boolean[],
  portStates?: { inputs?: PortDrawState[]; outputs?: PortDrawState[] },
) => {
  // Input ports (left side)
  config.inputs.forEach((port, i) => {
    const cx = (gate.position.x + port.offset.x) * vp.zoom + vp.offsetX;
    const cy = (gate.position.y + port.offset.y) * vp.zoom + vp.offsetY;
    const active = inputStates[i] ?? false;
    const state = portStates?.inputs?.[i];
    drawPortDot(ctx, cx, cy, vp.zoom, active, true, port.name, 'left', state);
  });

  // Output port (right side)
  config.outputs.forEach((port, i) => {
    const cx = (gate.position.x + port.offset.x) * vp.zoom + vp.offsetX;
    const cy = (gate.position.y + port.offset.y) * vp.zoom + vp.offsetY;
    const state = portStates?.outputs?.[i];
    drawPortDot(ctx, cx, cy, vp.zoom, gate.outputState, false, port.name, 'right', state);
  });
};

// ---------------------------------------------------------------
// Parameters object for gate shape renderers
// ---------------------------------------------------------------

/** Shared drawing parameters passed to each gate shape renderer */
interface GateShapeParams {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  w: number;
  h: number;
  zoom: number;
  outputState: boolean;
}

// ---------------------------------------------------------------
// Gate shape renderers — polished, professional logic symbols
// ---------------------------------------------------------------

/** NOT gate: clean triangle + inversion bubble */
const drawNotGate = ({ ctx, x, y, w, h, zoom, outputState }: GateShapeParams) => {
  const inset = w * 0.15; // padding
  const triRight = x + w * 0.72;

  // Triangle body with gradient
  ctx.beginPath();
  ctx.moveTo(x + inset, y + inset);
  ctx.lineTo(triRight, y + h * 0.5);
  ctx.lineTo(x + inset, y + h - inset);
  ctx.closePath();

  ctx.fillStyle = createBodyGradient(ctx, x, y, h);
  ctx.fill();

  // Stroke with rounded feel
  ctx.strokeStyle = GATE_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Inversion bubble (clear circle at output)
  const bubbleR = 5 * zoom;
  const bubbleCx = triRight + bubbleR + 3 * zoom;
  const bubbleCy = y + h * 0.5;

  // White fill for clean inversion bubble
  ctx.beginPath();
  ctx.arc(bubbleCx, bubbleCy, bubbleR, 0, Math.PI * 2);
  ctx.fillStyle = GATE_COLORS.bodyGradientTop;
  ctx.fill();
  ctx.strokeStyle = GATE_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Small inner circle for inversion indicator
  ctx.beginPath();
  ctx.arc(bubbleCx, bubbleCy, bubbleR * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = outputState ? GATE_COLORS.signalHigh : GATE_COLORS.signalLow;
  ctx.fill();

  // Signal LED on body
  drawSignalLed(ctx, x + inset + 8 * zoom, y + h * 0.5, zoom, outputState);
};

/** AND gate: proper D-shape with flat left, curved right */
const drawAndGate = ({ ctx, x, y, w, h, zoom, outputState }: GateShapeParams) => {
  const inset = w * 0.05;
  const curveStart = x + w * 0.35;

  // D-shape path
  ctx.beginPath();
  ctx.moveTo(x + inset, y + inset);
  ctx.lineTo(curveStart, y + inset);
  // Right semicircle (convex)
  ctx.arc(
    curveStart,
    y + h * 0.5,
    h * 0.5 - inset,
    -Math.PI / 2,
    Math.PI / 2,
  );
  ctx.lineTo(x + inset, y + h - inset);
  ctx.closePath();

  ctx.fillStyle = createBodyGradient(ctx, x, y, h);
  ctx.fill();

  ctx.strokeStyle = GATE_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Label
  ctx.fillStyle = GATE_COLORS.text;
  ctx.font = `bold ${11 * zoom}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AND', x + w * 0.22, y + h * 0.5);

  // Signal LED
  drawSignalLed(ctx, x + w * 0.55, y + h * 0.5, zoom, outputState);
};

/** OR gate: proper curved shape (concave left, convex right) */
const drawOrGate = ({ ctx, x, y, w, h, zoom, outputState }: GateShapeParams) => {
  const inset = w * 0.05;
  const midX = x + w * 0.35;

  // Curved OR shape
  ctx.beginPath();
  ctx.moveTo(x + inset, y + inset);
  // Concave left side (curves inward)
  ctx.quadraticCurveTo(midX, y + h * 0.5, x + inset, y + h - inset);
  // Bottom edge
  ctx.quadraticCurveTo(x + w * 0.35, y + h - inset * 2, x + w - inset * 2, y + h * 0.5);
  // Top edge (mirror)
  ctx.quadraticCurveTo(x + w * 0.35, y + inset * 2, x + inset, y + inset);
  ctx.closePath();

  ctx.fillStyle = createBodyGradient(ctx, x, y, h);
  ctx.fill();

  ctx.strokeStyle = GATE_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Label
  ctx.fillStyle = GATE_COLORS.text;
  ctx.font = `bold ${11 * zoom}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('OR', x + w * 0.42, y + h * 0.5);

  // Signal LED
  drawSignalLed(ctx, x + w * 0.65, y + h * 0.5, zoom, outputState);
};

/** NAND gate: AND shape + inversion bubble */
const drawNandGate = ({ ctx, x, y, w, h, zoom, outputState }: GateShapeParams) => {
  const inset = w * 0.05;
  const curveStart = x + w * 0.32;

  ctx.beginPath();
  ctx.moveTo(x + inset, y + inset);
  ctx.lineTo(curveStart, y + inset);
  ctx.arc(curveStart, y + h * 0.5, h * 0.5 - inset, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + inset, y + h - inset);
  ctx.closePath();

  ctx.fillStyle = createBodyGradient(ctx, x, y, h);
  ctx.fill();
  ctx.strokeStyle = GATE_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Inversion bubble at output tip
  const bubbleR = 4.5 * zoom;
  const bubbleCx = x + w * 0.32 + (h * 0.5 - inset) + bubbleR + 3 * zoom;
  const bubbleCy = y + h * 0.5;
  ctx.beginPath();
  ctx.arc(bubbleCx, bubbleCy, bubbleR, 0, Math.PI * 2);
  ctx.fillStyle = GATE_COLORS.bodyGradientTop;
  ctx.fill();
  ctx.strokeStyle = GATE_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bubbleCx, bubbleCy, bubbleR * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = outputState ? GATE_COLORS.signalHigh : GATE_COLORS.signalLow;
  ctx.fill();

  // Label
  ctx.fillStyle = GATE_COLORS.text;
  ctx.font = `bold ${10 * zoom}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NAND', x + w * 0.2, y + h * 0.5);

  drawSignalLed(ctx, x + w * 0.5, y + h * 0.5, zoom, outputState);
};

/** NOR gate: OR shape + inversion bubble */
const drawNorGate = ({ ctx, x, y, w, h, zoom, outputState }: GateShapeParams) => {
  const inset = w * 0.05;
  const midX = x + w * 0.35;

  ctx.beginPath();
  ctx.moveTo(x + inset, y + inset);
  ctx.quadraticCurveTo(midX, y + h * 0.5, x + inset, y + h - inset);
  ctx.quadraticCurveTo(x + w * 0.35, y + h - inset * 2, x + w * 0.8, y + h * 0.5);
  ctx.quadraticCurveTo(x + w * 0.35, y + inset * 2, x + inset, y + inset);
  ctx.closePath();

  ctx.fillStyle = createBodyGradient(ctx, x, y, h);
  ctx.fill();
  ctx.strokeStyle = GATE_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Inversion bubble
  const bubbleR = 4.5 * zoom;
  const bubbleCx = x + w * 0.8 + bubbleR + 2 * zoom;
  const bubbleCy = y + h * 0.5;
  ctx.beginPath();
  ctx.arc(bubbleCx, bubbleCy, bubbleR, 0, Math.PI * 2);
  ctx.fillStyle = GATE_COLORS.bodyGradientTop;
  ctx.fill();
  ctx.strokeStyle = GATE_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bubbleCx, bubbleCy, bubbleR * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = outputState ? GATE_COLORS.signalHigh : GATE_COLORS.signalLow;
  ctx.fill();

  ctx.fillStyle = GATE_COLORS.text;
  ctx.font = `bold ${10 * zoom}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NOR', x + w * 0.35, y + h * 0.5);

  drawSignalLed(ctx, x + w * 0.55, y + h * 0.5, zoom, outputState);
};

/** XOR gate: OR shape with extra input curve */
const drawXorGate = ({ ctx, x, y, w, h, zoom, outputState }: GateShapeParams) => {
  const inset = w * 0.05;
  const midX = x + w * 0.35;

  // Extra curved line on left (XOR indicator)
  ctx.beginPath();
  ctx.moveTo(x + inset - 4 * zoom, y + inset);
  ctx.quadraticCurveTo(midX - 4 * zoom, y + h * 0.5, x + inset - 4 * zoom, y + h - inset);
  ctx.strokeStyle = GATE_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Main OR shape
  ctx.beginPath();
  ctx.moveTo(x + inset, y + inset);
  ctx.quadraticCurveTo(midX, y + h * 0.5, x + inset, y + h - inset);
  ctx.quadraticCurveTo(x + w * 0.35, y + h - inset * 2, x + w - inset * 2, y + h * 0.5);
  ctx.quadraticCurveTo(x + w * 0.35, y + inset * 2, x + inset, y + inset);
  ctx.closePath();

  ctx.fillStyle = createBodyGradient(ctx, x, y, h);
  ctx.fill();
  ctx.strokeStyle = GATE_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.fillStyle = GATE_COLORS.text;
  ctx.font = `bold ${11 * zoom}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('XOR', x + w * 0.42, y + h * 0.5);

  drawSignalLed(ctx, x + w * 0.65, y + h * 0.5, zoom, outputState);
};

/** XNOR gate: XOR shape + inversion bubble */
const drawXnorGate = ({ ctx, x, y, w, h, zoom, outputState }: GateShapeParams) => {
  const inset = w * 0.05;
  const midX = x + w * 0.35;

  // Extra curved line on left (XOR indicator)
  ctx.beginPath();
  ctx.moveTo(x + inset - 4 * zoom, y + inset);
  ctx.quadraticCurveTo(midX - 4 * zoom, y + h * 0.5, x + inset - 4 * zoom, y + h - inset);
  ctx.strokeStyle = GATE_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Main OR shape
  ctx.beginPath();
  ctx.moveTo(x + inset, y + inset);
  ctx.quadraticCurveTo(midX, y + h * 0.5, x + inset, y + h - inset);
  ctx.quadraticCurveTo(x + w * 0.35, y + h - inset * 2, x + w * 0.8, y + h * 0.5);
  ctx.quadraticCurveTo(x + w * 0.35, y + inset * 2, x + inset, y + inset);
  ctx.closePath();

  ctx.fillStyle = createBodyGradient(ctx, x, y, h);
  ctx.fill();
  ctx.strokeStyle = GATE_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Inversion bubble
  const bubbleR = 4.5 * zoom;
  const bubbleCx = x + w * 0.8 + bubbleR + 2 * zoom;
  const bubbleCy = y + h * 0.5;
  ctx.beginPath();
  ctx.arc(bubbleCx, bubbleCy, bubbleR, 0, Math.PI * 2);
  ctx.fillStyle = GATE_COLORS.bodyGradientTop;
  ctx.fill();
  ctx.strokeStyle = GATE_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bubbleCx, bubbleCy, bubbleR * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = outputState ? GATE_COLORS.signalHigh : GATE_COLORS.signalLow;
  ctx.fill();

  ctx.fillStyle = GATE_COLORS.text;
  ctx.font = `bold ${10 * zoom}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('XNOR', x + w * 0.35, y + h * 0.5);

  drawSignalLed(ctx, x + w * 0.55, y + h * 0.5, zoom, outputState);
};

// ---------------------------------------------------------------
// I/O Component shape renderers
// ---------------------------------------------------------------

/** INPUT gate: toggle switch visual with ON/OFF label and color */
const drawInputGate = (
  { ctx, x, y, w, h, zoom }: GateShapeParams,
  outputState: boolean,
) => {
  // Body with gradient
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8 * zoom);
  ctx.fillStyle = createBodyGradient(ctx, x, y, h);
  ctx.fill();
  ctx.strokeStyle = GATE_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Switch track background
  const trackWidth = w * 0.6;
  const trackHeight = h * 0.28;
  const trackX = x + (w - trackWidth) / 2;
  const trackY = y + h * 0.28;

  ctx.fillStyle = outputState ? GATE_COLORS.switchOn : GATE_COLORS.switchOff;
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.roundRect(trackX, trackY, trackWidth, trackHeight, trackHeight / 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Switch thumb
  const thumbRadius = trackHeight * 0.42;
  const thumbCx = outputState
    ? trackX + trackWidth - thumbRadius - 2 * zoom
    : trackX + thumbRadius + 2 * zoom;
  const thumbCy = trackY + trackHeight / 2;

  // Thumb shadow
  ctx.beginPath();
  ctx.arc(thumbCx, thumbCy + 1 * zoom, thumbRadius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();

  // Thumb
  ctx.beginPath();
  ctx.arc(thumbCx, thumbCy, thumbRadius, 0, Math.PI * 2);
  ctx.fillStyle = outputState ? GATE_COLORS.switchOn : GATE_COLORS.switchOff;
  ctx.fill();
  ctx.strokeStyle = GATE_COLORS.portRing;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Thumb highlight
  ctx.beginPath();
  ctx.arc(thumbCx - thumbRadius * 0.2, thumbCy - thumbRadius * 0.25, thumbRadius * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fill();

  // ON/OFF label below switch
  ctx.fillStyle = outputState ? GATE_COLORS.switchOn : GATE_COLORS.switchOff;
  ctx.font = `bold ${9 * zoom}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(outputState ? 'ON' : 'OFF', x + w / 2, y + h * 0.85);

  // IN label above switch
  ctx.fillStyle = GATE_COLORS.textDim;
  ctx.font = `${8 * zoom}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText('IN', x + w / 2, y + h * 0.15);
};

/** OUTPUT / LED gate: displays signal state with glow effect */
const drawOutputGate = (
  { ctx, x, y, w, h, zoom }: GateShapeParams,
  outputState: boolean,
) => {
  // Body with gradient
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8 * zoom);
  ctx.fillStyle = createBodyGradient(ctx, x, y, h);
  ctx.fill();
  ctx.strokeStyle = GATE_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // LED circle
  const ledRadius = Math.min(w, h) * 0.22;
  const ledCx = x + w / 2;
  const ledCy = y + h * 0.42;

  // Glow effect when on
  if (outputState) {
    const glowRadius = ledRadius * 2.5;
    const glow = ctx.createRadialGradient(ledCx, ledCy, ledRadius * 0.5, ledCx, ledCy, glowRadius);
    glow.addColorStop(0, GATE_COLORS.ledGlow);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(ledCx, ledCy, glowRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // LED circle
  ctx.beginPath();
  ctx.arc(ledCx, ledCy, ledRadius, 0, Math.PI * 2);
  ctx.fillStyle = outputState ? GATE_COLORS.ledOn : GATE_COLORS.ledOff;
  ctx.fill();
  ctx.strokeStyle = GATE_COLORS.portRing;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Inner highlight when on
  if (outputState) {
    ctx.beginPath();
    ctx.arc(ledCx - ledRadius * 0.2, ledCy - ledRadius * 0.2, ledRadius * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fill();
  }

  // OUT label below LED
  ctx.fillStyle = GATE_COLORS.textDim;
  ctx.font = `${8 * zoom}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('OUT', x + w / 2, y + h * 0.85);
};

/** CONSTANT_HIGH gate: always outputs 1, shows fixed "1" label */
const drawConstantHighGate = ({ ctx, x, y, w, h, zoom }: GateShapeParams) => {
  // Body with gradient
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8 * zoom);
  ctx.fillStyle = createBodyGradient(ctx, x, y, h);
  ctx.fill();
  ctx.strokeStyle = GATE_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Value indicator: green background tint
  ctx.fillStyle = GATE_COLORS.constantHigh;
  ctx.globalAlpha = 0.1;
  ctx.beginPath();
  ctx.roundRect(x + 3 * zoom, y + 3 * zoom, w - 6 * zoom, h - 6 * zoom, 5 * zoom);
  ctx.fill();
  ctx.globalAlpha = 1;

  // "1" label
  ctx.fillStyle = GATE_COLORS.constantHigh;
  ctx.font = `bold ${18 * zoom}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('1', x + w / 2, y + h * 0.42);

  // Small label
  ctx.fillStyle = GATE_COLORS.textDim;
  ctx.font = `${7 * zoom}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText('HIGH', x + w / 2, y + h * 0.82);
};

/** CONSTANT_LOW gate: always outputs 0, shows fixed "0" label */
const drawConstantLowGate = ({ ctx, x, y, w, h, zoom }: GateShapeParams) => {
  // Body with gradient
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8 * zoom);
  ctx.fillStyle = createBodyGradient(ctx, x, y, h);
  ctx.fill();
  ctx.strokeStyle = GATE_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Value indicator: red background tint
  ctx.fillStyle = GATE_COLORS.constantLow;
  ctx.globalAlpha = 0.1;
  ctx.beginPath();
  ctx.roundRect(x + 3 * zoom, y + 3 * zoom, w - 6 * zoom, h - 6 * zoom, 5 * zoom);
  ctx.fill();
  ctx.globalAlpha = 1;

  // "0" label
  ctx.fillStyle = GATE_COLORS.constantLow;
  ctx.font = `bold ${18 * zoom}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('0', x + w / 2, y + h * 0.42);

  // Small label
  ctx.fillStyle = GATE_COLORS.textDim;
  ctx.font = `${7 * zoom}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText('LOW', x + w / 2, y + h * 0.82);
};

// ---------------------------------------------------------------
// Main gate drawing function
// ---------------------------------------------------------------

export interface DrawGateParams {
  ctx: CanvasRenderingContext2D;
  gate: Gate;
  config: GateConfig;
  vp: Viewport;
  selected: boolean;
  hovered: boolean;
  inputStates: boolean[];
  /** Per-port draw states for connection mode highlights */
  portStates?: { inputs?: PortDrawState[]; outputs?: PortDrawState[] };
}

/** Draw a gate with its type-specific symbol, border, label, and ports */
export const drawGateSymbol = ({
  ctx,
  gate,
  config,
  vp,
  selected,
  hovered,
  inputStates,
  portStates,
}: DrawGateParams) => {
  const x = gate.position.x * vp.zoom + vp.offsetX;
  const y = gate.position.y * vp.zoom + vp.offsetY;
  const w = config.width * vp.zoom;
  const h = config.height * vp.zoom;

  // --- Layer 1: Background effects (selection/hover glow) ---
  if (selected) {
    drawSelectionGlow(ctx, x, y, w, h, vp.zoom);
  } else if (hovered) {
    drawHoverGlow(ctx, x, y, w, h, vp.zoom);
  }

  // --- Layer 2: Drop shadow ---
  drawDropShadow(ctx, x, y, w, h, vp.zoom);

  // --- Layer 3: Border style ---
  if (selected) {
    ctx.strokeStyle = GATE_COLORS.borderSelected;
    ctx.lineWidth = 2.5;
  } else if (hovered) {
    ctx.strokeStyle = GATE_COLORS.borderHover;
    ctx.lineWidth = 2;
  } else {
    ctx.strokeStyle = GATE_COLORS.border;
    ctx.lineWidth = 1.5;
  }

  const shapeParams: GateShapeParams = {
    ctx, x, y, w, h,
    zoom: vp.zoom,
    outputState: gate.outputState,
  };

  // --- Layer 4: Draw the gate shape based on type ---
  switch (gate.type) {
    case 'NOT':
      drawNotGate(shapeParams);
      break;
    case 'AND':
      drawAndGate(shapeParams);
      break;
    case 'OR':
      drawOrGate(shapeParams);
      break;
    case 'NAND':
      drawNandGate(shapeParams);
      break;
    case 'NOR':
      drawNorGate(shapeParams);
      break;
    case 'XOR':
      drawXorGate(shapeParams);
      break;
    case 'XNOR':
      drawXnorGate(shapeParams);
      break;
    case 'INPUT':
      drawInputGate(shapeParams, gate.outputState);
      break;
    case 'OUTPUT':
      drawOutputGate(shapeParams, gate.outputState);
      break;
    case 'CONSTANT_HIGH':
      drawConstantHighGate(shapeParams);
      break;
    case 'CONSTANT_LOW':
      drawConstantLowGate(shapeParams);
      break;
    default: {
      // Generic rounded rectangle for other types
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 8 * vp.zoom);
      ctx.fillStyle = createBodyGradient(ctx, x, y, h);
      ctx.fill();
      ctx.strokeStyle = GATE_COLORS.border;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label
      ctx.fillStyle = GATE_COLORS.text;
      ctx.font = `bold ${13 * vp.zoom}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(config.label, x + w / 2, y + h / 2);
      break;
    }
  }

  // --- Layer 5: Draw ports on top ---
  drawPorts(ctx, gate, config, vp, inputStates, portStates);
};
