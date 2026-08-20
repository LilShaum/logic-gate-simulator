import type { Gate, GateConfig, Viewport } from '@/types/circuit';

// ---------------------------------------------------------------
// Color palette for gates
// ---------------------------------------------------------------
export const GATE_COLORS = {
  body: '#16213e',
  border: '#0f3460',
  borderSelected: '#e94560',
  borderHover: '#53a8b6',
  text: '#eaeaea',
  portDot: '#53a8b6',
  portActive: '#00e676',
  portInactive: '#3a3a5c',
  outputHigh: '#00e676',
  outputLow: '#3a3a5c',
  inputHigh: '#00e676',
  inputLow: '#3a3a5c',
  // I/O specific colors
  switchOn: '#00e676',
  switchOff: '#e94560',
  ledOn: '#00e676',
  ledOff: '#3a3a5c',
  ledGlow: 'rgba(0, 230, 118, 0.4)',
  constantHigh: '#00e676',
  constantLow: '#e94560',
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
  const radius = 8 / zoom; // fixed screen-space radius
  const dx = px - pos.x;
  const dy = py - pos.y;
  return dx * dx + dy * dy <= radius * radius;
};

// ---------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------

/** Draw a port dot at a given canvas position */
const drawPortDot = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  zoom: number,
  active: boolean,
) => {
  const r = 4 * zoom;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = active ? GATE_COLORS.portActive : GATE_COLORS.portDot;
  ctx.fill();
  ctx.strokeStyle = '#0a0a1a';
  ctx.lineWidth = 1;
  ctx.stroke();
};

/** Draw all ports for a gate in canvas coordinates */
const drawPorts = (
  ctx: CanvasRenderingContext2D,
  gate: Gate,
  config: GateConfig,
  vp: Viewport,
  inputStates: boolean[],
) => {
  // Input ports (left side)
  config.inputs.forEach((port, i) => {
    const cx = (gate.position.x + port.offset.x) * vp.zoom + vp.offsetX;
    const cy = (gate.position.y + port.offset.y) * vp.zoom + vp.offsetY;
    const active = inputStates[i] ?? false;
    drawPortDot(ctx, cx, cy, vp.zoom, active);
  });

  // Output port (right side)
  config.outputs.forEach((port) => {
    const cx = (gate.position.x + port.offset.x) * vp.zoom + vp.offsetX;
    const cy = (gate.position.y + port.offset.y) * vp.zoom + vp.offsetY;
    drawPortDot(ctx, cx, cy, vp.zoom, gate.outputState);
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
}

// ---------------------------------------------------------------
// Gate shape renderers
// ---------------------------------------------------------------

/** NOT gate: triangle pointing right + small circle at output */
const drawNotGate = ({ ctx, x, y, w, h, zoom }: GateShapeParams) => {
  // Triangle body
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w * 0.75, y + h * 0.5);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Small circle at output (NOT indicator)
  const circleR = 5 * zoom;
  const circleCx = x + w * 0.75 + circleR + 2 * zoom;
  const circleCy = y + h * 0.5;
  ctx.beginPath();
  ctx.arc(circleCx, circleCy, circleR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
};

/** AND gate: D-shape (flat left, curved right) */
const drawAndGate = ({ ctx, x, y, w, h, zoom }: GateShapeParams) => {
  const inset = w * 0.3; // where the curve starts

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + inset, y);
  ctx.arc(x + inset, y + h * 0.5, h * 0.5, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Label
  ctx.fillStyle = GATE_COLORS.text;
  ctx.font = `bold ${12 * zoom}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AND', x + inset * 0.5, y + h * 0.5);
};

/** OR gate: curved back + curved front (curved D-shape) */
const drawOrGate = ({ ctx, x, y, w, h, zoom }: GateShapeParams) => {
  const inset = w * 0.3;
  const curveDepth = w * 0.15;

  ctx.beginPath();
  ctx.moveTo(x, y);
  // Curved input side (concave)
  ctx.quadraticCurveTo(x + inset, y + h * 0.5, x, y + h);
  // Bottom edge going right
  ctx.lineTo(x + w * 0.15, y + h);
  // Curved output side (convex)
  ctx.quadraticCurveTo(
    x + inset * 1.8 + curveDepth,
    y + h * 0.5,
    x + w * 0.15,
    y,
  );
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Label
  ctx.fillStyle = GATE_COLORS.text;
  ctx.font = `bold ${12 * zoom}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('OR', x + w * 0.4, y + h * 0.5);
};

// ---------------------------------------------------------------
// I/O Component shape renderers
// ---------------------------------------------------------------

/** INPUT gate: toggle switch visual with ON/OFF label and color */
const drawInputGate = (
  { ctx, x, y, w, h, zoom }: GateShapeParams,
  outputState: boolean,
) => {
  // Body
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6 * zoom);
  ctx.fill();
  ctx.stroke();

  // Switch track background
  const trackWidth = w * 0.6;
  const trackHeight = h * 0.3;
  const trackX = x + (w - trackWidth) / 2;
  const trackY = y + (h - trackHeight) / 2;

  ctx.fillStyle = outputState ? GATE_COLORS.switchOn : GATE_COLORS.switchOff;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.roundRect(trackX, trackY, trackWidth, trackHeight, trackHeight / 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Switch thumb
  const thumbRadius = trackHeight * 0.4;
  const thumbCx = outputState
    ? trackX + trackWidth - thumbRadius - 2 * zoom
    : trackX + thumbRadius + 2 * zoom;
  const thumbCy = trackY + trackHeight / 2;

  ctx.beginPath();
  ctx.arc(thumbCx, thumbCy, thumbRadius, 0, Math.PI * 2);
  ctx.fillStyle = outputState ? GATE_COLORS.switchOn : GATE_COLORS.switchOff;
  ctx.fill();
  ctx.strokeStyle = '#0a0a1a';
  ctx.lineWidth = 1;
  ctx.stroke();

  // ON/OFF label below switch
  ctx.fillStyle = outputState ? GATE_COLORS.switchOn : GATE_COLORS.switchOff;
  ctx.font = `bold ${9 * zoom}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(outputState ? 'ON' : 'OFF', x + w / 2, y + h * 0.82);

  // IN label above switch
  ctx.fillStyle = '#8888aa';
  ctx.font = `${8 * zoom}px monospace`;
  ctx.fillText('IN', x + w / 2, y + h * 0.18);
};

/** OUTPUT / LED gate: displays signal state with glow effect */
const drawOutputGate = (
  { ctx, x, y, w, h, zoom }: GateShapeParams,
  outputState: boolean,
) => {
  // Body
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6 * zoom);
  ctx.fill();
  ctx.stroke();

  // LED circle
  const ledRadius = Math.min(w, h) * 0.25;
  const ledCx = x + w / 2;
  const ledCy = y + h * 0.45;

  // Glow effect when on
  if (outputState) {
    const glowRadius = ledRadius * 2.2;
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
  ctx.strokeStyle = '#0a0a1a';
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
  ctx.fillStyle = '#8888aa';
  ctx.font = `${8 * zoom}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('OUT', x + w / 2, y + h * 0.82);
};

/** CONSTANT_HIGH gate: always outputs 1, shows fixed "1" label */
const drawConstantHighGate = ({ ctx, x, y, w, h, zoom }: GateShapeParams) => {
  // Body
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6 * zoom);
  ctx.fill();
  ctx.stroke();

  // Value indicator: green background tint
  ctx.fillStyle = GATE_COLORS.constantHigh;
  ctx.globalAlpha = 0.12;
  ctx.beginPath();
  ctx.roundRect(x + 2 * zoom, y + 2 * zoom, w - 4 * zoom, h - 4 * zoom, 4 * zoom);
  ctx.fill();
  ctx.globalAlpha = 1;

  // "1" label
  ctx.fillStyle = GATE_COLORS.constantHigh;
  ctx.font = `bold ${18 * zoom}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('1', x + w / 2, y + h * 0.45);

  // Small label
  ctx.fillStyle = '#8888aa';
  ctx.font = `${7 * zoom}px monospace`;
  ctx.fillText('HIGH', x + w / 2, y + h * 0.82);
};

/** CONSTANT_LOW gate: always outputs 0, shows fixed "0" label */
const drawConstantLowGate = ({ ctx, x, y, w, h, zoom }: GateShapeParams) => {
  // Body
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6 * zoom);
  ctx.fill();
  ctx.stroke();

  // Value indicator: red background tint
  ctx.fillStyle = GATE_COLORS.constantLow;
  ctx.globalAlpha = 0.12;
  ctx.beginPath();
  ctx.roundRect(x + 2 * zoom, y + 2 * zoom, w - 4 * zoom, h - 4 * zoom, 4 * zoom);
  ctx.fill();
  ctx.globalAlpha = 1;

  // "0" label
  ctx.fillStyle = GATE_COLORS.constantLow;
  ctx.font = `bold ${18 * zoom}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('0', x + w / 2, y + h * 0.45);

  // Small label
  ctx.fillStyle = '#8888aa';
  ctx.font = `${7 * zoom}px monospace`;
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
}: DrawGateParams) => {
  const x = gate.position.x * vp.zoom + vp.offsetX;
  const y = gate.position.y * vp.zoom + vp.offsetY;
  const w = config.width * vp.zoom;
  const h = config.height * vp.zoom;

  // Body fill
  ctx.fillStyle = GATE_COLORS.body;

  // Border color
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

  const shapeParams: GateShapeParams = { ctx, x, y, w, h, zoom: vp.zoom };

  // Draw the gate shape based on type
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
      ctx.roundRect(x, y, w, h, 6 * vp.zoom);
      ctx.fill();
      ctx.stroke();

      // Label
      ctx.fillStyle = GATE_COLORS.text;
      ctx.font = `bold ${13 * vp.zoom}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(config.label, x + w / 2, y + h / 2);
      break;
    }
  }

  // Draw ports on top
  drawPorts(ctx, gate, config, vp, inputStates);
};
