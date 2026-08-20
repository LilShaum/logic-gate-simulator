// ============================================================
// Wire Renderer — Manhattan-routed orthogonal wires
// ============================================================

import type { Viewport, Wire, Gate } from '@/types/circuit';
import { getWireScreenPoints } from '@/utils/wireUtils';

// ---------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------
const WIRE_COLORS = {
  signalHigh: '#00e676',
  signalLow: '#3a3a5c',
  selected: '#e94560',
  hover: '#53a8b6',
  preview: '#53a8b6',
};

// ---------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------

/** Draw a single wire on the canvas using Manhattan routing */
export const drawWireOnCanvas = (
  ctx: CanvasRenderingContext2D,
  wire: Wire,
  gates: Gate[],
  vp: Viewport,
  opts: { selected: boolean; hovered: boolean },
) => {
  const points = getWireScreenPoints(wire, gates, vp);
  if (points.length < 2) return;

  // Determine color
  let color: string;
  if (opts.selected) {
    color = WIRE_COLORS.selected;
  } else if (opts.hovered) {
    color = WIRE_COLORS.hover;
  } else {
    color = wire.signal ? WIRE_COLORS.signalHigh : WIRE_COLORS.signalLow;
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = opts.selected ? 3 : 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Draw as a series of straight line segments (Manhattan routing)
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();

  // Draw a subtle glow for high-signal wires
  if (wire.signal && !opts.selected && !opts.hovered) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 230, 118, 0.15)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }
};

/** Draw a preview wire (during connection mode) */
export const drawPreviewWire = (
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  valid: boolean,
) => {
  if (points.length < 2) return;

  ctx.save();
  ctx.strokeStyle = valid ? WIRE_COLORS.preview : 'rgba(233, 69, 96, 0.6)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
  ctx.restore();
};
