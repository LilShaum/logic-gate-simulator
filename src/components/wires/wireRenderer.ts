// ============================================================
// Wire Renderer — Smooth bezier-routed wires with signal animation
// ============================================================

import type { Viewport, Wire, Gate, SimulationSpeed } from '@/types/circuit';
import { getWireScreenPoints, getWireBezierSegments } from '@/utils/wireUtils';
import { getGateConfig } from '@/utils/gateConfigs';

// ---------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------
const WIRE_COLORS = {
  signalHigh: '#00ff88',
  signalLow: '#4a4a6a',
  selected: '#e94560',
  hover: '#53a8b6',
  preview: '#53a8b6',
  snapGlow: 'rgba(83, 168, 182, 0.6)',
};

// Glow colors (used as shadow and translucent overlays)
const GLOW_COLORS = {
  signalHigh: 'rgba(0, 255, 136, 0.20)',
  signalHighStrong: 'rgba(0, 255, 136, 0.35)',
  signalLow: 'rgba(74, 74, 106, 0.12)',
  selected: 'rgba(233, 69, 96, 0.25)',
  hover: 'rgba(83, 168, 182, 0.18)',
};

// ---------------------------------------------------------------
// Wire stroke widths
// ---------------------------------------------------------------
const STROKE_WIDTH = {
  base: 2.5,
  selected: 3.5,
  hover: 3.0,
  glow: 8,
};

// ---------------------------------------------------------------
// Animation config
// ---------------------------------------------------------------

/** Speed multipliers for signal flow dots (pixels per ms) */
const ANIMATION_SPEED: Record<SimulationSpeed, number> = {
  slow: 0.06,
  normal: 0.12,
  fast: 0.28,
};

/** Number of signal dots per wire */
const SIGNAL_DOT_COUNT = 3;

/** Signal dot radius (screen px) */
const SIGNAL_DOT_RADIUS = 2.8;

// ---------------------------------------------------------------
// Utility — approximate path length for animation
// ---------------------------------------------------------------

/** Approximate the total length of a bezier path */
const approximatePathLength = (
  segments: Array<{ start: { x: number; y: number }; cp1: { x: number; y: number }; cp2: { x: number; y: number }; end: { x: number; y: number } }>,
): number => {
  let total = 0;
  for (const seg of segments) {
    // Approximate with chord lengths (4 sample points)
    const steps = 8;
    let prevX = seg.start.x;
    let prevY = seg.start.y;
    for (let t = 1; t <= steps; t++) {
      const s = t / steps;
      const mt = 1 - s;
      const x = mt * mt * mt * seg.start.x + 3 * mt * mt * s * seg.cp1.x + 3 * mt * s * s * seg.cp2.x + s * s * s * seg.end.x;
      const y = mt * mt * mt * seg.start.y + 3 * mt * mt * s * seg.cp1.y + 3 * mt * s * s * seg.cp2.y + s * s * s * seg.end.y;
      total += Math.sqrt((x - prevX) * (x - prevX) + (y - prevY) * (y - prevY));
      prevX = x;
      prevY = y;
    }
  }
  return total;
};

/** Get a point at parametric t along the full bezier path */
const getPointAtT = (
  segments: Array<{ start: { x: number; y: number }; cp1: { x: number; y: number }; cp2: { x: number; y: number }; end: { x: number; y: number } }>,
  t: number,
): { x: number; y: number } => {
  const n = segments.length;
  if (n === 0) return { x: 0, y: 0 };

  const scaled = t * n;
  const idx = Math.min(Math.floor(scaled), n - 1);
  const localT = scaled - idx;
  const seg = segments[idx];

  const mt = 1 - localT;
  return {
    x: mt * mt * mt * seg.start.x + 3 * mt * mt * localT * seg.cp1.x + 3 * mt * localT * localT * seg.cp2.x + localT * localT * localT * seg.end.x,
    y: mt * mt * mt * seg.start.y + 3 * mt * mt * localT * seg.cp1.y + 3 * mt * localT * localT * seg.cp2.y + localT * localT * localT * seg.end.y,
  };
};

// ---------------------------------------------------------------
// Drawing — created wires (smooth bezier curves)
// ---------------------------------------------------------------

/** Draw a smooth bezier path through the given points */
const drawSmoothPath = (
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
) => {
  if (points.length < 2) return;

  const segments = getWireBezierSegments(points);
  if (segments.length === 0) return;

  ctx.beginPath();
  ctx.moveTo(segments[0].start.x, segments[0].start.y);
  for (const seg of segments) {
    ctx.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.end.x, seg.end.y);
  }
};

/** Draw signal flow dots moving along the wire path */
const drawSignalFlowDots = (
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  time: number,
  speed: SimulationSpeed,
  zoom: number,
) => {
  const segments = getWireBezierSegments(points);
  if (segments.length === 0) return;

  const pathLength = approximatePathLength(segments);
  if (pathLength < 10) return;

  const speedFactor = ANIMATION_SPEED[speed];
  const dotSpacing = 1 / SIGNAL_DOT_COUNT;

  for (let i = 0; i < SIGNAL_DOT_COUNT; i++) {
    const baseT = (i * dotSpacing + time * speedFactor * 0.001) % 1;
    const pos = getPointAtT(segments, baseT);

    // Bright core
    const radius = SIGNAL_DOT_RADIUS * Math.min(zoom, 2);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = WIRE_COLORS.signalHigh;
    ctx.fill();

    // Glow halo
    const glowR = radius * 3;
    const glow = ctx.createRadialGradient(pos.x, pos.y, radius * 0.5, pos.x, pos.y, glowR);
    glow.addColorStop(0, 'rgba(0, 255, 136, 0.4)');
    glow.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, glowR, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
  }
};

/** Draw a single wire on the canvas using smooth bezier routing */
export const drawWireOnCanvas = (
  ctx: CanvasRenderingContext2D,
  wire: Wire,
  gates: Gate[],
  vp: Viewport,
  opts: { selected: boolean; hovered: boolean },
  animOpts?: { time: number; speed: SimulationSpeed },
) => {
  const points = getWireScreenPoints(wire, gates, vp);
  if (points.length < 2) return;

  // Determine color
  let color: string;
  let glowColor: string;
  if (opts.selected) {
    color = WIRE_COLORS.selected;
    glowColor = GLOW_COLORS.selected;
  } else if (opts.hovered) {
    color = WIRE_COLORS.hover;
    glowColor = GLOW_COLORS.hover;
  } else if (wire.signal) {
    color = WIRE_COLORS.signalHigh;
    glowColor = GLOW_COLORS.signalHigh;
  } else {
    color = WIRE_COLORS.signalLow;
    glowColor = GLOW_COLORS.signalLow;
  }

  const lineWidth = opts.selected
    ? STROKE_WIDTH.selected
    : opts.hovered
      ? STROKE_WIDTH.hover
      : STROKE_WIDTH.base;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // --- Glow layer (drawn behind the main wire) ---
  // Selected wire: strong glow
  if (opts.selected) {
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = STROKE_WIDTH.glow;
    drawSmoothPath(ctx, points);
    ctx.stroke();
  }

  // High signal: ambient glow
  if (wire.signal && !opts.selected && !opts.hovered) {
    ctx.strokeStyle = GLOW_COLORS.signalHighStrong;
    ctx.lineWidth = STROKE_WIDTH.glow;
    drawSmoothPath(ctx, points);
    ctx.stroke();
  }

  // Hover: subtle glow
  if (opts.hovered && !opts.selected) {
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = STROKE_WIDTH.glow * 0.75;
    drawSmoothPath(ctx, points);
    ctx.stroke();
  }

  // --- Main wire ---
  // Shadow for depth on high-signal wires
  if (wire.signal) {
    ctx.shadowColor = 'rgba(0, 255, 136, 0.35)';
    ctx.shadowBlur = 6 * vp.zoom;
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  drawSmoothPath(ctx, points);
  ctx.stroke();

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // --- Signal flow animation (moving dots) ---
  if (wire.signal && animOpts) {
    drawSignalFlowDots(ctx, points, animOpts.time, animOpts.speed, vp.zoom);
  }

  ctx.restore();
};

// ---------------------------------------------------------------
// Wire junction detection & bridge drawing
// ---------------------------------------------------------------

/** Get screen-space line segments for a wire */
const getWireSegments = (
  points: { x: number; y: number }[],
): Array<{ x1: number; y1: number; x2: number; y2: number }> => {
  const segs: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    segs.push({ x1: points[i].x, y1: points[i].y, x2: points[i + 1].x, y2: points[i + 1].y });
  }
  return segs;
};

/** Find intersection of two line segments, return null if they don't cross */
const segmentIntersection = (
  a: { x1: number; y1: number; x2: number; y2: number },
  b: { x1: number; y1: number; x2: number; y2: number },
): { x: number; y: number } | null => {
  const d1x = a.x2 - a.x1; const d1y = a.y2 - a.y1;
  const d2x = b.x2 - b.x1; const d2y = b.y2 - b.y1;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 0.5) return null; // parallel or nearly

  const t = ((b.x1 - a.x1) * d2y - (b.y1 - a.y1) * d2x) / cross;
  const u = ((b.x1 - a.x1) * d1y - (b.y1 - a.y1) * d1x) / cross;

  if (t >= 0.05 && t <= 0.95 && u >= 0.05 && u <= 0.95) {
    return { x: a.x1 + t * d1x, y: a.y1 + t * d1y };
  }
  return null;
};

/** Detect junctions (crossing points) between all wire segments */
export const detectWireJunctions = (
  allWires: Wire[],
  gates: Gate[],
  vp: Viewport,
): { x: number; y: number }[] => {
  // Collect all segments with their wire IDs
  const allSegs: Array<{ seg: { x1: number; y1: number; x2: number; y2: number }; wireIdx: number }> = [];
  allWires.forEach((wire, wi) => {
    const pts = getWireScreenPoints(wire, gates, vp);
    if (pts.length < 2) return;
    const segs = getWireSegments(pts);
    for (const seg of segs) {
      allSegs.push({ seg, wireIdx: wi });
    }
  });

  const junctions: { x: number; y: number }[] = [];
  // Only compare segments from different wires
  for (let i = 0; i < allSegs.length; i++) {
    for (let j = i + 1; j < allSegs.length; j++) {
      if (allSegs[i].wireIdx === allSegs[j].wireIdx) continue;
      const pt = segmentIntersection(allSegs[i].seg, allSegs[j].seg);
      if (pt) {
        // Deduplicate nearby junctions
        const isDupe = junctions.some(
          (j) => Math.abs(j.x - pt.x) < 4 && Math.abs(j.y - pt.y) < 4,
        );
        if (!isDupe) junctions.push(pt);
      }
    }
  }
  return junctions;
};

/** Draw small bridge/hop arcs at wire junction crossings */
export const drawWireJunctions = (
  ctx: CanvasRenderingContext2D,
  junctions: { x: number; y: number }[],
  zoom: number,
) => {
  if (junctions.length === 0) return;

  const bridgeR = 5 * zoom;
  ctx.save();

  for (const j of junctions) {
    // Draw a small semi-circle bridge (hop) — background circle
    ctx.beginPath();
    ctx.arc(j.x, j.y, bridgeR + 1.5 * zoom, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a2e';
    ctx.fill();

    // Draw the bridge arc (top half)
    ctx.beginPath();
    ctx.arc(j.x, j.y, bridgeR, Math.PI, 0);
    ctx.strokeStyle = 'rgba(136, 136, 170, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Small dot at crossing
    ctx.beginPath();
    ctx.arc(j.x, j.y, 1.5 * zoom, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(136, 136, 170, 0.35)';
    ctx.fill();
  }

  ctx.restore();
};

// ---------------------------------------------------------------
// Wire hover tooltip info
// ---------------------------------------------------------------

/** Info displayed in the wire hover tooltip */
export interface WireTooltipInfo {
  fromGateLabel: string;
  fromPortName: string;
  toGateLabel: string;
  toPortName: string;
  signal: boolean;
}

/** Get tooltip info for a hovered wire */
export const getWireTooltipInfo = (
  wire: Wire,
  gates: Gate[],
): WireTooltipInfo | null => {
  const fromGate = gates.find((g) => g.id === wire.fromGateId);
  const toGate = gates.find((g) => g.id === wire.toGateId);
  if (!fromGate || !toGate) return null;

  // Resolve configs
  const fromConfig = getGateConfig(fromGate.type);
  const toConfig = getGateConfig(toGate.type);

  const fromPort = fromConfig.outputs[wire.fromPortIndex];
  const toPort = toConfig.inputs[wire.toPortIndex];

  return {
    fromGateLabel: fromConfig.label,
    fromPortName: fromPort?.name ?? `OUT${wire.fromPortIndex}`,
    toGateLabel: toConfig.label,
    toPortName: toPort?.name ?? `IN${wire.toPortIndex}`,
    signal: wire.signal,
  };
};

// ---------------------------------------------------------------
// Preview wire drawing
// ---------------------------------------------------------------

/** Draw a preview wire (during connection mode) — uses cubic bezier for smooth curves */
export const drawPreviewWire = (
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  valid: boolean,
) => {
  if (points.length < 2) return;

  ctx.save();
  ctx.strokeStyle = valid ? WIRE_COLORS.preview : 'rgba(233, 69, 96, 0.6)';
  ctx.lineWidth = STROKE_WIDTH.base;
  ctx.setLineDash([6, 4]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (points.length === 4) {
    // Cubic bezier path: start, cp1, cp2, end
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.bezierCurveTo(
      points[1].x, points[1].y,
      points[2].x, points[2].y,
      points[3].x, points[3].y,
    );
    ctx.stroke();

    // Draw a subtle glow for valid connections
    if (valid) {
      ctx.strokeStyle = 'rgba(83, 168, 182, 0.2)';
      ctx.lineWidth = STROKE_WIDTH.glow;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.bezierCurveTo(
        points[1].x, points[1].y,
        points[2].x, points[2].y,
        points[3].x, points[3].y,
      );
      ctx.stroke();
    }
  } else {
    // Fallback: straight line segments
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }
  ctx.restore();
};

// ---------------------------------------------------------------
// Snap feedback animation
// ---------------------------------------------------------------

/** Draw animated snap glow feedback around a port */
export const drawSnapFeedback = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  zoom: number,
  valid: boolean,
  time: number,
) => {
  const color = valid ? 'rgba(83, 168, 182, 0.5)' : 'rgba(233, 69, 96, 0.5)';
  const glowColor = valid ? 'rgba(83, 168, 182, 0.2)' : 'rgba(233, 69, 96, 0.2)';

  // Pulsing ring
  const pulsePhase = (Math.sin(time * 0.005) + 1) * 0.5; // 0..1 oscillation
  const baseR = 12 * zoom;
  const pulseR = baseR + pulsePhase * 4 * zoom;

  ctx.save();

  // Outer glow
  const glowR = pulseR * 1.8;
  const glow = ctx.createRadialGradient(cx, cy, pulseR * 0.5, cx, cy, glowR);
  glow.addColorStop(0, glowColor);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
  ctx.fill();

  // Pulsing ring
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
};
