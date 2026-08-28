// ============================================================
// Gate rendering
//
// Every shape is drawn inside the box that gateConfigs.ts
// declares, and every port sits exactly where gateConfigs.ts
// says it does. Short lead lines join the two, so a symbol and
// its pins can never drift apart.
// ============================================================

import type { Gate, GateConfig, Viewport } from '@/types/circuit';
import { BUBBLE_R, LEAD } from '@/utils/gateConfigs';

// ---------------------------------------------------------------
// Palette
// ---------------------------------------------------------------
export const GATE_COLORS = {
  body: '#161f36',
  bodyGradientTop: '#1f2b47',
  bodyGradientBottom: '#141c30',
  border: '#3a4d75',
  borderSelected: '#ffb454',
  borderHover: '#58b6ff',
  text: '#e6ecf7',
  textDim: '#8b9ac0',

  // Signal states — one green for "high" everywhere in the app
  signalHigh: '#3ddc97',
  signalLow: '#4a5872',
  signalGlow: 'rgba(61, 220, 151, 0.45)',

  portDot: '#6d7f9f',
  portActive: '#3ddc97',
  portInactive: '#3a4560',
  portRing: '#0b1020',
  outputHigh: '#3ddc97',
  outputLow: '#4a5872',
  inputHigh: '#3ddc97',
  inputLow: '#4a5872',

  selectionGlow: 'rgba(255, 180, 84, 0.45)',
  hoverGlow: 'rgba(88, 182, 255, 0.28)',

  switchOn: '#3ddc97',
  switchOff: '#5a6684',
  ledOn: '#3ddc97',
  ledOff: '#333e57',
  ledGlow: 'rgba(61, 220, 151, 0.5)',
  constantHigh: '#3ddc97',
  constantLow: '#7c89a6',
  clock: '#58b6ff',

  portHover: '#9fd6ff',
  portValid: '#3ddc97',
  portInvalid: '#ff6b6b',
  portSnapGlow: 'rgba(88, 182, 255, 0.55)',
};

// ---------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------

const bodyGradient = (
  ctx: CanvasRenderingContext2D,
  y: number,
  h: number,
): CanvasGradient => {
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, GATE_COLORS.bodyGradientTop);
  grad.addColorStop(1, GATE_COLORS.bodyGradientBottom);
  return grad;
};

/** Fill + stroke the path currently on the context */
const paintBody = (
  ctx: CanvasRenderingContext2D,
  y: number,
  h: number,
  stroke: string,
  lineWidth: number,
) => {
  ctx.fillStyle = bodyGradient(ctx, y, h);
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.stroke();
};

/** Centred label, hidden when the gate is too small to read */
const drawLabel = (
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  zoom: number,
  size = 11,
  color = GATE_COLORS.text,
) => {
  if (zoom < 0.45) return;
  ctx.fillStyle = color;
  ctx.font = `600 ${size * zoom}px "Inter", "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
};

/** An inversion bubble sitting on the nose of a gate */
const drawBubble = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  stroke: string,
  lineWidth: number,
  active: boolean,
) => {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = active ? GATE_COLORS.signalHigh : GATE_COLORS.bodyGradientBottom;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
};

// ---------------------------------------------------------------
// Geometry / hit testing (shared with wire routing)
// ---------------------------------------------------------------

/** World-space position of a gate's port */
export const getPortWorldPosition = (
  gate: Gate,
  config: GateConfig,
  portIndex: number,
  isInput: boolean,
): { x: number; y: number } => {
  const ports = isInput ? config.inputs : config.outputs;
  const port = ports[portIndex];
  if (!port) return { x: gate.position.x, y: gate.position.y };
  return {
    x: gate.position.x + port.offset.x,
    y: gate.position.y + port.offset.y,
  };
};

/** Is a world-space point inside a gate's bounding box? */
export const isPointInGate = (
  px: number,
  py: number,
  gate: Gate,
  config: GateConfig,
): boolean =>
  px >= gate.position.x &&
  px <= gate.position.x + config.width &&
  py >= gate.position.y &&
  py <= gate.position.y + config.height;

/**
 * Is a world-space point near a port? The hit radius is kept
 * constant in *screen* pixels so ports stay clickable when zoomed out.
 */
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
  const radius = 11 / Math.max(zoom, 0.2);
  const dx = px - pos.x;
  const dy = py - pos.y;
  return dx * dx + dy * dy <= radius * radius;
};

// ---------------------------------------------------------------
// Ports
// ---------------------------------------------------------------

export interface PortDrawState {
  hovered?: boolean;
  highlight?: 'valid' | 'invalid';
  snapTarget?: boolean;
}

const PORT_R = 4;

const drawPort = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  zoom: number,
  active: boolean,
  isInput: boolean,
  state?: PortDrawState,
) => {
  const r = PORT_R * zoom * (state?.hovered ? 1.4 : 1);

  if (state?.snapTarget || state?.highlight) {
    const color = state.highlight === 'invalid' ? GATE_COLORS.portInvalid : GATE_COLORS.portValid;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 * zoom;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4 * zoom, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.75;
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  if (isInput) {
    // Inputs are squares, outputs circles — tells you which end is which
    ctx.rect(cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = state?.hovered
    ? GATE_COLORS.portHover
    : active
      ? GATE_COLORS.portActive
      : GATE_COLORS.portDot;
  ctx.fill();

  // Thin outline for contrast against the grid, drawn *around* the port
  // rather than as a disc behind it, so an arriving wire is not clipped.
  ctx.strokeStyle = GATE_COLORS.portRing;
  ctx.lineWidth = Math.max(0.75, 1 * zoom);
  ctx.stroke();
};

/** Short line from a port out to the gate body */
const drawLead = (
  ctx: CanvasRenderingContext2D,
  fromX: number,
  toX: number,
  y: number,
  zoom: number,
  active: boolean,
) => {
  ctx.beginPath();
  ctx.moveTo(fromX, y);
  ctx.lineTo(toX, y);
  ctx.strokeStyle = active ? GATE_COLORS.signalHigh : GATE_COLORS.border;
  ctx.lineWidth = Math.max(1, 1.75 * zoom);
  ctx.lineCap = 'round';
  ctx.stroke();
};

/** Port name, drawn just inside the body */
const drawPortLabel = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  zoom: number,
  align: CanvasTextAlign,
) => {
  if (zoom < 0.75 || !text) return;
  ctx.fillStyle = GATE_COLORS.textDim;
  ctx.font = `${8 * zoom}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
};

// ---------------------------------------------------------------
// Shape renderers
//
// All receive screen-space box coords. `bodyL`/`bodyR` are the
// horizontal extent of the drawn symbol; leads bridge box to body.
// ---------------------------------------------------------------

interface ShapeParams {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  w: number;
  h: number;
  zoom: number;
  stroke: string;
  lineWidth: number;
  outputState: boolean;
}

/** Horizontal extent of the symbol itself, excluding leads and bubble */
const bodySpan = (x: number, w: number, zoom: number, inverted: boolean) => {
  const lead = LEAD * zoom;
  const bubble = inverted ? BUBBLE_R * 2 * zoom : 0;
  return { bodyL: x + lead, bodyR: x + w - lead - bubble, bubbleR: BUBBLE_R * zoom };
};

/**
 * AND family: flat back, rounded nose.
 *
 * The nose is elliptical rather than circular. A circle of radius h/2
 * is wider than the whole body once a gate has more than about three
 * inputs, which turned tall AND gates into crescents.
 */
const andPath = (
  ctx: CanvasRenderingContext2D,
  bodyL: number,
  bodyR: number,
  y: number,
  h: number,
) => {
  const ry = h / 2;
  const rx = Math.min(ry, (bodyR - bodyL) * 0.55);
  const straight = bodyR - rx;
  const cy = y + ry;

  ctx.beginPath();
  ctx.moveTo(bodyL, y);
  ctx.lineTo(straight, y);
  ctx.ellipse(straight, cy, rx, ry, 0, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(bodyL, y + h);
  ctx.closePath();
};

/** OR family: concave back, pointed nose */
const orPath = (
  ctx: CanvasRenderingContext2D,
  bodyL: number,
  bodyR: number,
  y: number,
  h: number,
) => {
  const midY = y + h / 2;
  const backBulge = bodyL + h * 0.34;
  ctx.beginPath();
  ctx.moveTo(bodyL, y);
  // top edge sweeping out to the nose
  ctx.quadraticCurveTo(bodyL + (bodyR - bodyL) * 0.62, y, bodyR, midY);
  // bottom edge back to the tail
  ctx.quadraticCurveTo(bodyL + (bodyR - bodyL) * 0.62, y + h, bodyL, y + h);
  // concave back
  ctx.quadraticCurveTo(backBulge, midY, bodyL, y);
  ctx.closePath();
};

/** The extra back arc that distinguishes XOR/XNOR from OR/NOR */
const drawXorArc = (
  ctx: CanvasRenderingContext2D,
  bodyL: number,
  y: number,
  h: number,
  zoom: number,
  stroke: string,
  lineWidth: number,
) => {
  const gap = 5 * zoom;
  ctx.beginPath();
  ctx.moveTo(bodyL - gap, y);
  ctx.quadraticCurveTo(bodyL - gap + h * 0.34, y + h / 2, bodyL - gap, y + h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
};

/** NOT/BUFFER: triangle pointing right */
const trianglePath = (
  ctx: CanvasRenderingContext2D,
  bodyL: number,
  bodyR: number,
  y: number,
  h: number,
) => {
  ctx.beginPath();
  ctx.moveTo(bodyL, y);
  ctx.lineTo(bodyR, y + h / 2);
  ctx.lineTo(bodyL, y + h);
  ctx.closePath();
};

const drawLogicShape = (
  type: 'AND' | 'OR' | 'NAND' | 'NOR' | 'XOR' | 'XNOR' | 'NOT' | 'BUFFER',
  { ctx, x, y, w, h, zoom, stroke, lineWidth, outputState }: ShapeParams,
) => {
  const inverted = type === 'NAND' || type === 'NOR' || type === 'XNOR' || type === 'NOT';
  const { bodyL, bodyR, bubbleR } = bodySpan(x, w, zoom, inverted);
  const midY = y + h / 2;

  if (type === 'XOR' || type === 'XNOR') {
    drawXorArc(ctx, bodyL, y, h, zoom, stroke, lineWidth);
  }

  switch (type) {
    case 'AND':
    case 'NAND':
      andPath(ctx, bodyL, bodyR, y, h);
      break;
    case 'OR':
    case 'NOR':
    case 'XOR':
    case 'XNOR':
      orPath(ctx, bodyL, bodyR, y, h);
      break;
    default:
      trianglePath(ctx, bodyL, bodyR, y, h);
  }
  paintBody(ctx, y, h, stroke, lineWidth);

  if (inverted) {
    drawBubble(ctx, bodyR + bubbleR, midY, bubbleR, stroke, lineWidth, outputState);
  }

  // Label only where there is room: AND-family gates have a flat area,
  // OR-family gates are labelled a bit left of the nose.
  if (type !== 'NOT' && type !== 'BUFFER') {
    const isAnd = type === 'AND' || type === 'NAND';
    const cx = isAnd ? bodyL + (bodyR - bodyL) * 0.4 : bodyL + (bodyR - bodyL) * 0.46;
    drawLabel(ctx, type, cx, midY, zoom, 10);
  }

  return { bodyL, bodyR: inverted ? bodyR + bubbleR * 2 : bodyR };
};

// --- I/O primitives -------------------------------------------

const drawSwitch = ({ ctx, x, y, w, h, zoom, stroke, lineWidth, outputState }: ShapeParams, label?: string) => {
  const { bodyL, bodyR } = bodySpan(x, w, zoom, false);
  const bw = bodyR - bodyL;

  ctx.beginPath();
  ctx.roundRect(bodyL, y, bw, h, 6 * zoom);
  paintBody(ctx, y, h, outputState ? GATE_COLORS.signalHigh : stroke, lineWidth);

  // Toggle track + knob
  const pad = 6 * zoom;
  const trackH = Math.min(h - pad * 2, 14 * zoom);
  const trackW = Math.min(bw - pad * 2, 26 * zoom);
  const trackX = bodyL + (bw - trackW) / 2;
  const trackY = y + (h - trackH) / 2;

  ctx.beginPath();
  ctx.roundRect(trackX, trackY, trackW, trackH, trackH / 2);
  ctx.fillStyle = outputState ? 'rgba(61, 220, 151, 0.25)' : 'rgba(0, 0, 0, 0.35)';
  ctx.fill();
  ctx.strokeStyle = outputState ? GATE_COLORS.switchOn : GATE_COLORS.switchOff;
  ctx.lineWidth = Math.max(1, 1.2 * zoom);
  ctx.stroke();

  const knobR = trackH / 2 - 1.5 * zoom;
  const knobX = outputState ? trackX + trackW - knobR - 2 * zoom : trackX + knobR + 2 * zoom;
  ctx.beginPath();
  ctx.arc(knobX, trackY + trackH / 2, knobR, 0, Math.PI * 2);
  ctx.fillStyle = outputState ? GATE_COLORS.switchOn : GATE_COLORS.switchOff;
  ctx.fill();

  if (label && zoom >= 0.6) {
    drawLabel(ctx, label, bodyL + bw / 2, y - 8 * zoom, zoom, 9, GATE_COLORS.textDim);
  }
  return { bodyL, bodyR };
};

const drawLed = ({ ctx, x, y, w, h, zoom, stroke, lineWidth, outputState }: ShapeParams, label?: string) => {
  const { bodyL, bodyR } = bodySpan(x, w, zoom, false);
  const bw = bodyR - bodyL;
  const cx = bodyL + bw / 2;
  const cy = y + h / 2;

  ctx.beginPath();
  ctx.roundRect(bodyL, y, bw, h, 6 * zoom);
  paintBody(ctx, y, h, outputState ? GATE_COLORS.signalHigh : stroke, lineWidth);

  const r = Math.min(bw, h) * 0.28;
  if (outputState) {
    ctx.save();
    ctx.shadowColor = GATE_COLORS.ledGlow;
    ctx.shadowBlur = 14 * zoom;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = GATE_COLORS.ledOn;
    ctx.fill();
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = GATE_COLORS.ledOff;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = outputState ? GATE_COLORS.ledOn : GATE_COLORS.border;
  ctx.lineWidth = Math.max(1, 1.2 * zoom);
  ctx.stroke();

  if (label && zoom >= 0.6) {
    drawLabel(ctx, label, cx, y - 8 * zoom, zoom, 9, GATE_COLORS.textDim);
  }
  return { bodyL, bodyR };
};

const drawConstant = ({ ctx, x, y, w, h, zoom, stroke, lineWidth }: ShapeParams, high: boolean) => {
  const { bodyL, bodyR } = bodySpan(x, w, zoom, false);
  const bw = bodyR - bodyL;
  ctx.beginPath();
  ctx.roundRect(bodyL, y, bw, h, 5 * zoom);
  paintBody(ctx, y, h, high ? GATE_COLORS.constantHigh : stroke, lineWidth);
  drawLabel(
    ctx,
    high ? '1' : '0',
    bodyL + bw / 2,
    y + h / 2,
    zoom,
    14,
    high ? GATE_COLORS.constantHigh : GATE_COLORS.constantLow,
  );
  return { bodyL, bodyR };
};

const drawClock = ({ ctx, x, y, w, h, zoom, stroke, lineWidth, outputState }: ShapeParams) => {
  const { bodyL, bodyR } = bodySpan(x, w, zoom, false);
  const bw = bodyR - bodyL;
  ctx.beginPath();
  ctx.roundRect(bodyL, y, bw, h, 5 * zoom);
  paintBody(ctx, y, h, outputState ? GATE_COLORS.signalHigh : stroke, lineWidth);

  // Square-wave glyph
  const pad = 8 * zoom;
  const gx = bodyL + pad;
  const gw = bw - pad * 2;
  const hi = y + h * 0.32;
  const lo = y + h * 0.68;
  ctx.beginPath();
  ctx.moveTo(gx, lo);
  ctx.lineTo(gx + gw * 0.25, lo);
  ctx.lineTo(gx + gw * 0.25, hi);
  ctx.lineTo(gx + gw * 0.6, hi);
  ctx.lineTo(gx + gw * 0.6, lo);
  ctx.lineTo(gx + gw, lo);
  ctx.strokeStyle = outputState ? GATE_COLORS.signalHigh : GATE_COLORS.clock;
  ctx.lineWidth = Math.max(1, 1.6 * zoom);
  ctx.lineJoin = 'round';
  ctx.stroke();
  return { bodyL, bodyR };
};

/** Rectangular symbol used by flip-flops, latches and custom blocks */
const drawBoxSymbol = (
  { ctx, x, y, w, h, zoom, stroke, lineWidth }: ShapeParams,
  config: GateConfig,
  title: string,
  clockPortIndex?: number,
) => {
  const { bodyL, bodyR } = bodySpan(x, w, zoom, false);
  const bw = bodyR - bodyL;

  ctx.beginPath();
  ctx.roundRect(bodyL, y, bw, h, 5 * zoom);
  paintBody(ctx, y, h, stroke, lineWidth);

  drawLabel(ctx, title, bodyL + bw / 2, y + 11 * zoom, zoom, 9, GATE_COLORS.textDim);

  // Port names inside the box
  config.inputs.forEach((p, i) => {
    const py = y + p.offset.y * zoom;
    if (i === clockPortIndex) {
      // Standard clock-input wedge
      const s = 5 * zoom;
      ctx.beginPath();
      ctx.moveTo(bodyL, py - s);
      ctx.lineTo(bodyL + s * 1.4, py);
      ctx.lineTo(bodyL, py + s);
      ctx.strokeStyle = GATE_COLORS.textDim;
      ctx.lineWidth = Math.max(1, 1.2 * zoom);
      ctx.lineJoin = 'round';
      ctx.stroke();
    } else {
      drawPortLabel(ctx, p.name, bodyL + 5 * zoom, py, zoom, 'left');
    }
  });
  config.outputs.forEach((p) => {
    drawPortLabel(ctx, p.name, bodyR - 5 * zoom, y + p.offset.y * zoom, zoom, 'right');
  });

  return { bodyL, bodyR };
};

// ---------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------

export interface DrawGateParams {
  ctx: CanvasRenderingContext2D;
  gate: Gate;
  config: GateConfig;
  vp: Viewport;
  selected: boolean;
  hovered: boolean;
  inputStates: boolean[];
  portStates?: { inputs?: PortDrawState[]; outputs?: PortDrawState[] };
  /** Title override, used for custom block instances */
  title?: string;
}

/** Draw one gate: symbol, leads, ports. */
export const drawGateSymbol = ({
  ctx,
  gate,
  config,
  vp,
  selected,
  hovered,
  inputStates,
  portStates,
  title,
}: DrawGateParams) => {
  const { zoom } = vp;
  const x = gate.position.x * zoom + vp.offsetX;
  const y = gate.position.y * zoom + vp.offsetY;
  const w = config.width * zoom;
  const h = config.height * zoom;

  const stroke = selected
    ? GATE_COLORS.borderSelected
    : hovered
      ? GATE_COLORS.borderHover
      : GATE_COLORS.border;
  const lineWidth = selected ? 2.2 : hovered ? 1.9 : 1.4;

  // Selection / hover halo behind the symbol
  if (selected || hovered) {
    ctx.save();
    ctx.shadowColor = selected ? GATE_COLORS.selectionGlow : GATE_COLORS.hoverGlow;
    ctx.shadowBlur = (selected ? 16 : 11) * zoom;
    ctx.beginPath();
    ctx.roundRect(x + LEAD * zoom, y, w - LEAD * 2 * zoom, h, 7 * zoom);
    ctx.fillStyle = selected ? 'rgba(255,180,84,0.10)' : 'rgba(88,182,255,0.07)';
    ctx.fill();
    ctx.restore();
  }

  const params: ShapeParams = {
    ctx,
    x,
    y,
    w,
    h,
    zoom,
    stroke,
    lineWidth,
    outputState: gate.outputState,
  };

  const outStates = gate.outputStates ?? [gate.outputState];
  let span: { bodyL: number; bodyR: number };

  switch (gate.type) {
    case 'AND':
    case 'OR':
    case 'NOT':
    case 'NAND':
    case 'NOR':
    case 'XOR':
    case 'XNOR':
    case 'BUFFER':
      span = drawLogicShape(gate.type, params);
      break;
    case 'INPUT':
      span = drawSwitch(params, gate.label);
      break;
    case 'OUTPUT':
      span = drawLed(params, gate.label);
      break;
    case 'CONSTANT_HIGH':
      span = drawConstant(params, true);
      break;
    case 'CONSTANT_LOW':
      span = drawConstant(params, false);
      break;
    case 'CLOCK':
      span = drawClock(params);
      break;
    case 'D_FLIPFLOP':
    case 'T_FLIPFLOP':
      span = drawBoxSymbol(params, config, config.label, 1);
      break;
    case 'SR_LATCH':
      span = drawBoxSymbol(params, config, config.label);
      break;
    default:
      span = drawBoxSymbol(params, config, title ?? config.label);
  }

  // Leads from the box edge to the symbol
  config.inputs.forEach((port, i) => {
    const py = y + port.offset.y * zoom;
    drawLead(ctx, x, span.bodyL, py, zoom, inputStates[i] ?? false);
  });
  config.outputs.forEach((port, i) => {
    const py = y + port.offset.y * zoom;
    drawLead(ctx, span.bodyR, x + w, py, zoom, outStates[i] ?? false);
  });

  // Ports last, so they sit on top of everything
  config.inputs.forEach((port, i) => {
    drawPort(
      ctx,
      x + port.offset.x * zoom,
      y + port.offset.y * zoom,
      zoom,
      inputStates[i] ?? false,
      true,
      portStates?.inputs?.[i],
    );
  });
  config.outputs.forEach((port, i) => {
    drawPort(
      ctx,
      x + port.offset.x * zoom,
      y + port.offset.y * zoom,
      zoom,
      outStates[i] ?? false,
      false,
      portStates?.outputs?.[i],
    );
  });
};
