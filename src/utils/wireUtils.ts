// ============================================================
// Wire Utilities — Smart routing, validation, hit testing
// ============================================================

import type {
  CircuitState,
  Gate,
  GateConfig,
  Position,
  Wire,
} from '@/types/circuit';
import { getConfigForGate } from '@/utils/gateConfigs';
import { getPortWorldPosition } from '@/components/gates';

import { generateId } from '@/utils/generateId';

// ---------------------------------------------------------------
// Gate Bounding Box (with padding for smart routing)
// ---------------------------------------------------------------

/** Get the bounding box of a gate in world space with optional padding */
const getGateBoundingBox = (
  gate: Gate,
  config: GateConfig,
  padding: number = 20,
): { x: number; y: number; x2: number; y2: number } => ({
  x: gate.position.x - padding,
  y: gate.position.y - padding,
  x2: gate.position.x + config.width + padding,
  y2: gate.position.y + config.height + padding,
});

/** Check if a line segment intersects a bounding box (axis-aligned) */
const segmentIntersectsBox = (
  x1: number, y1: number,
  x2: number, y2: number,
  box: { x: number; y: number; x2: number; y2: number },
): boolean => {
  // Only handle axis-aligned segments (horizontal or vertical)
  const isHorizontal = Math.abs(y1 - y2) < 0.5;
  const isVertical = Math.abs(x1 - x2) < 0.5;

  if (isHorizontal) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    return !(maxX < box.x || minX > box.x2 || y1 < box.y || y1 > box.y2);
  }
  if (isVertical) {
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    return !(x1 < box.x || x1 > box.x2 || maxY < box.y || minY > box.y2);
  }

  return false;
};

// ---------------------------------------------------------------
// Smart Routing — avoids overlapping gates
// ---------------------------------------------------------------


/** How far before an input pin a wire turns to make its final approach */
const APPROACH = 18;
/** Clearance kept around gates when routing around them */
const CLEARANCE = 18;

/**
 * Compute the intermediate waypoints between two ports.
 *
 * The default shape runs horizontally at the source's height for most
 * of the distance, then turns down (or up) just before the destination
 * pin. Fanning one output into several inputs therefore produces one
 * shared horizontal run instead of a bundle of diverging diagonals.
 */
export const computeSmartRoute = (
  from: Position,
  to: Position,
  fromGateId: string,
  toGateId: string,
  gates: Gate[],
): Position[] => {
  // Near-level ports get a direct connection. Forcing a hard vertical
  // jog for a two-pixel height difference is what made short wires look
  // like they had a stray tick mark in them.
  if (Math.abs(from.y - to.y) <= 10) return [];

  const obstacles = gates
    .filter((g) => g.id !== fromGateId && g.id !== toGateId)
    .map((g) => getGateBoundingBox(g, getConfigForGate(g), CLEARANCE));

  const clear = (wps: Position[]): boolean => {
    const pts = [from, ...wps, to];
    for (let i = 0; i < pts.length - 1; i++) {
      for (const box of obstacles) {
        if (segmentIntersectsBox(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, box)) {
          return false;
        }
      }
    }
    return true;
  };

  const turnAt = (x: number): Position[] => [
    { x, y: from.y },
    { x, y: to.y },
  ];

  const candidates: Position[][] = [];

  if (to.x - from.x > APPROACH * 2) {
    // Forward run: turn late, just before the pin
    candidates.push(turnAt(to.x - APPROACH));
    // then progressively earlier turns
    candidates.push(turnAt((from.x + to.x) / 2));
    candidates.push(turnAt(from.x + APPROACH));
  } else {
    // The destination is behind the source (feedback). Go out, around,
    // and back in — never straight through the gate that drives it.
    const relevant = obstacles.filter(
      (b) => b.x2 >= Math.min(from.x, to.x) - CLEARANCE && b.x <= Math.max(from.x, to.x) + CLEARANCE,
    );
    const below = relevant.length ? Math.max(...relevant.map((b) => b.y2)) + CLEARANCE : Math.max(from.y, to.y) + 40;
    const above = relevant.length ? Math.min(...relevant.map((b) => b.y)) - CLEARANCE : Math.min(from.y, to.y) - 40;

    for (const laneY of [below, above]) {
      candidates.push([
        { x: from.x + APPROACH, y: from.y },
        { x: from.x + APPROACH, y: laneY },
        { x: to.x - APPROACH, y: laneY },
        { x: to.x - APPROACH, y: to.y },
      ]);
    }
  }

  // Detour lanes above and below everything in the way
  const between = obstacles.filter(
    (b) => b.x2 >= Math.min(from.x, to.x) && b.x <= Math.max(from.x, to.x),
  );
  if (between.length > 0) {
    const lower = Math.max(...between.map((b) => b.y2)) + CLEARANCE;
    const upper = Math.min(...between.map((b) => b.y)) - CLEARANCE;
    for (const laneY of [lower, upper]) {
      candidates.push([
        { x: from.x + APPROACH, y: from.y },
        { x: from.x + APPROACH, y: laneY },
        { x: to.x - APPROACH, y: laneY },
        { x: to.x - APPROACH, y: to.y },
      ]);
    }
  }

  for (const wps of candidates) {
    if (clear(wps)) return wps;
  }

  // Nothing was clear — take the tidiest shape anyway
  return candidates[0] ?? turnAt((from.x + to.x) / 2);
};

// ---------------------------------------------------------------
// Legacy Manhattan Routing (kept for backwards compatibility)
// ---------------------------------------------------------------

/**
 * Compute Manhattan (orthogonal) route waypoints between two points.
 * Produces a horizontal-then-vertical path with one or two bends.
 */
export const computeManhattanRoute = (
  from: Position,
  to: Position,
): Position[] => {
  const midX = (from.x + to.x) / 2;
  return [
    { x: midX, y: from.y },
    { x: midX, y: to.y },
  ];
};

// ---------------------------------------------------------------
// Bezier Control Points for Smooth Wire Rendering
// ---------------------------------------------------------------

/**
 * Compute cubic bezier control points for a smooth wire through waypoints.
 * Returns an array of 4-point groups [start, cp1, cp2, end] for each segment.
 */
export const getWireBezierSegments = (
  points: Position[],
): Array<{ start: Position; cp1: Position; cp2: Position; end: Position }> => {
  if (points.length < 2) return [];

  const segments: Array<{ start: Position; cp1: Position; cp2: Position; end: Position }> = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Control point offset proportional to distance, minimum 20px
    const cpOffset = Math.max(20, dist * 0.35);

    // Determine direction: horizontal segments get horizontal control points
    const isHorizontal = Math.abs(dy) < Math.abs(dx) * 0.3;
    const isVertical = Math.abs(dx) < Math.abs(dy) * 0.3;

    let cp1: Position;
    let cp2: Position;

    if (isHorizontal) {
      cp1 = { x: p0.x + cpOffset, y: p0.y };
      cp2 = { x: p1.x - cpOffset, y: p1.y };
    } else if (isVertical) {
      cp1 = { x: p0.x, y: p0.y + cpOffset * Math.sign(dy) };
      cp2 = { x: p1.x, y: p1.y - cpOffset * Math.sign(dy) };
    } else {
      // Diagonal: use a mix
      cp1 = { x: p0.x + dx * 0.35, y: p0.y };
      cp2 = { x: p1.x - dx * 0.35, y: p1.y };
    }

    segments.push({ start: p0, cp1, cp2, end: p1 });
  }

  return segments;
};

// ---------------------------------------------------------------
// Wire Screen/World Points (using smart routing)
// ---------------------------------------------------------------

/**
 * Get the full set of screen-space points for drawing a wire
 * (start → waypoints → end), all in canvas coordinates.
 * Uses smart routing to avoid overlapping gates.
 */
export const getWireScreenPoints = (
  wire: Wire,
  gates: Gate[],
  vp: { zoom: number; offsetX: number; offsetY: number },
): Position[] => {
  const fromGate = gates.find((g) => g.id === wire.fromGateId);
  const toGate = gates.find((g) => g.id === wire.toGateId);
  if (!fromGate || !toGate) return [];

  const fromConfig = getConfigForGate(fromGate);
  const toConfig = getConfigForGate(toGate);

  const fromPort = getPortWorldPosition(fromGate, fromConfig, wire.fromPortIndex, false);
  const toPort = getPortWorldPosition(toGate, toConfig, wire.toPortIndex, true);

  const sx = (p: Position): Position => ({
    x: p.x * vp.zoom + vp.offsetX,
    y: p.y * vp.zoom + vp.offsetY,
  });

  const worldWaypoints = computeSmartRoute(fromPort, toPort, wire.fromGateId, wire.toGateId, gates);
  return [sx(fromPort), ...worldWaypoints.map(sx), sx(toPort)];
};

/**
 * Get the full set of world-space points for a wire
 * (start → waypoints → end).
 * Uses smart routing to avoid overlapping gates.
 */
export const getWireWorldPoints = (
  wire: Wire,
  gates: Gate[],
): Position[] => {
  const fromGate = gates.find((g) => g.id === wire.fromGateId);
  const toGate = gates.find((g) => g.id === wire.toGateId);
  if (!fromGate || !toGate) return [];

  const fromConfig = getConfigForGate(fromGate);
  const toConfig = getConfigForGate(toGate);

  const fromPort = getPortWorldPosition(fromGate, fromConfig, wire.fromPortIndex, false);
  const toPort = getPortWorldPosition(toGate, toConfig, wire.toPortIndex, true);

  const waypoints = computeSmartRoute(fromPort, toPort, wire.fromGateId, wire.toGateId, gates);
  return [fromPort, ...waypoints, toPort];
};

// ---------------------------------------------------------------
// Connection Validation
// ---------------------------------------------------------------

/** Result of validating a proposed connection */
export interface ConnectionValidation {
  valid: boolean;
  reason?: string;
}

/**
 * Validate whether a new wire can be created.
 * Rules:
 * - Must connect output → input
 * - Cannot connect output-to-output or input-to-input
 * - Cannot connect multiple outputs to the same input (no fan-in)
 * - Cannot create duplicate wire
 * - Cannot self-connect (same gate output to same gate input is ok for some,
 *   but for clarity we allow it — only disallow output→output etc.)
 */
export const validateConnection = (
  circuit: CircuitState,
  fromGateId: string,
  fromPortIndex: number,
  toGateId: string,
  toPortIndex: number,
): ConnectionValidation => {
  const fromGate = circuit.gates.find((g) => g.id === fromGateId);
  const toGate = circuit.gates.find((g) => g.id === toGateId);
  if (!fromGate || !toGate) {
    return { valid: false, reason: 'Gate not found' };
  }

  const fromConfig = getConfigForGate(fromGate);
  const toConfig = getConfigForGate(toGate);

  // Must connect output → input
  if (fromPortIndex >= fromConfig.outputs.length) {
    return { valid: false, reason: 'Source port is not a valid output' };
  }
  if (toPortIndex >= toConfig.inputs.length) {
    return { valid: false, reason: 'Target port is not a valid input' };
  }

  // Check no existing wire already connected to this input
  const existingWireToInput = circuit.wires.find(
    (w) => w.toGateId === toGateId && w.toPortIndex === toPortIndex,
  );
  if (existingWireToInput) {
    return { valid: false, reason: 'Input port already connected' };
  }

  // Check for duplicate wire
  const duplicate = circuit.wires.find(
    (w) =>
      w.fromGateId === fromGateId &&
      w.fromPortIndex === fromPortIndex &&
      w.toGateId === toGateId &&
      w.toPortIndex === toPortIndex,
  );
  if (duplicate) {
    return { valid: false, reason: 'Wire already exists' };
  }

  return { valid: true };
};

// ---------------------------------------------------------------
// Wire Creation
// ---------------------------------------------------------------

/** Create a new Wire object connecting output → input */
export const createWire = (
  fromGateId: string,
  fromPortIndex: number,
  toGateId: string,
  toPortIndex: number,
  signal: boolean = false,
): Wire => ({
  id: generateId(),
  fromGateId,
  fromPortIndex,
  toGateId,
  toPortIndex,
  signal,
  waypoints: [],
});

// ---------------------------------------------------------------
// Wire Hit Testing
// ---------------------------------------------------------------

/**
 * Find the wire closest to a screen-space point, within a tolerance.
 * Returns the wire ID and distance, or null if none is close enough.
 */
export const findWireAtPoint = (
  circuit: CircuitState,
  sx: number,
  sy: number,
  vp: { zoom: number; offsetX: number; offsetY: number },
  tolerance: number = 6,
): Wire | null => {
  let closestWire: Wire | null = null;
  let closestDist = Infinity;

  for (const wire of circuit.wires) {
    const points = getWireScreenPoints(wire, circuit.gates, vp);
    if (points.length < 2) continue;

    // Check distance from point to each segment
    for (let i = 0; i < points.length - 1; i++) {
      const dist = pointToSegmentDistance(
        sx,
        sy,
        points[i].x,
        points[i].y,
        points[i + 1].x,
        points[i + 1].y,
      );
      if (dist < tolerance && dist < closestDist) {
        closestDist = dist;
        closestWire = wire;
      }
    }
  }

  return closestWire;
};

/** Distance from a point to a line segment */
const pointToSegmentDistance = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    // Degenerate segment — just point distance
    const ex = px - ax;
    const ey = py - ay;
    return Math.sqrt(ex * ex + ey * ey);
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const ex = px - projX;
  const ey = py - projY;
  return Math.sqrt(ex * ex + ey * ey);
};

// ---------------------------------------------------------------
// Preview Wire for Connecting Mode
// ---------------------------------------------------------------

/**
 * Compute world-space waypoints for a preview wire from a port to the mouse.
 * Returns a curved bezier path (start, control1, control2, end) for smooth rendering.
 * `mouseWorld` is in world coordinates.
 */
export const getPreviewWirePoints = (
  fromGate: Gate,
  fromPortIndex: number,
  mouseWorld: Position,
): Position[] => {
  const config = getConfigForGate(fromGate);
  const fromPort = getPortWorldPosition(fromGate, config, fromPortIndex, false);

  // Compute control points for a smooth cubic bezier curve
  // The curve leaves the port horizontally and arrives at the target horizontally
  const dx = mouseWorld.x - fromPort.x;
  const dy = mouseWorld.y - fromPort.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Control point offset proportional to distance, minimum 40px
  const cpOffset = Math.max(40, dist * 0.4);

  return [
    fromPort,
    { x: fromPort.x + cpOffset, y: fromPort.y },
    { x: mouseWorld.x - cpOffset, y: mouseWorld.y },
    mouseWorld,
  ];
};
