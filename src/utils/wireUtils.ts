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
import { getGateConfig } from '@/utils/gateConfigs';
import { getPortWorldPosition } from '@/components/gates';
import { isBlockInstance } from '@/utils/blockUtils';
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

/** Resolve config for any gate (handles block instances) */
const resolveConfig = (gate: Gate): GateConfig => {
  if (isBlockInstance(gate) && gate.blockId) {
    // For smart routing we just need width/height, so return a minimal config
    // The block config isn't available here without the block definitions,
    // so we fall back to the gate's base config. Width/height are set by
    // the block config at render time, but for routing we use default sizes.
    return getGateConfig(gate.type);
  }
  return getGateConfig(gate.type);
};

/**
 * Compute smart route waypoints between two port positions.
 * Routes around gate bounding boxes to avoid overlapping.
 * Returns intermediate waypoints (not including start/end).
 */
export const computeSmartRoute = (
  from: Position,
  to: Position,
  fromGateId: string,
  toGateId: string,
  gates: Gate[],
): Position[] => {
  // First try simple Manhattan route
  const midX = (from.x + to.x) / 2;
  const manhattanWps: Position[] = [
    { x: midX, y: from.y },
    { x: midX, y: to.y },
  ];

  // Get all gate bounding boxes (excluding source and target gates)
  const obstacles = gates
    .filter((g) => g.id !== fromGateId && g.id !== toGateId)
    .map((g) => getGateBoundingBox(g, resolveConfig(g), 15));

  // Check if the simple Manhattan route intersects any gate
  const intersectsAny = (wps: Position[]): boolean => {
    const pts = [from, ...wps, to];
    for (let i = 0; i < pts.length - 1; i++) {
      for (const box of obstacles) {
        if (segmentIntersectsBox(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, box)) {
          return true;
        }
      }
    }
    return false;
  };

  if (!intersectsAny(manhattanWps)) {
    return manhattanWps;
  }

  // Simple Manhattan route intersects a gate — try routing above or below
  // Find the Y range of all obstacles between the from and to X positions
  const minX = Math.min(from.x, to.x);
  const maxX = Math.max(from.x, to.x);

  const relevantObstacles = obstacles.filter(
    (b) => !(b.x2 < minX || b.x > maxX),
  );

  if (relevantObstacles.length === 0) {
    return manhattanWps;
  }

  // Try routing above all obstacles
  const maxY = Math.max(...relevantObstacles.map((b) => b.y2));
  const aboveRoute: Position[] = [
    { x: from.x, y: maxY + 30 },
    { x: to.x, y: maxY + 30 },
  ];

  if (!intersectsAny(aboveRoute)) {
    return aboveRoute;
  }

  // Try routing below all obstacles
  const minY = Math.min(...relevantObstacles.map((b) => b.y));
  const belowRoute: Position[] = [
    { x: from.x, y: minY - 30 },
    { x: to.x, y: minY - 30 },
  ];

  if (!intersectsAny(belowRoute)) {
    return belowRoute;
  }

  // Try a more aggressive route: go far above, then across, then down
  const farAbove: Position[] = [
    { x: from.x, y: maxY + 60 },
    { x: to.x, y: maxY + 60 },
  ];
  if (!intersectsAny(farAbove)) {
    return farAbove;
  }

  // Try far below
  const farBelow: Position[] = [
    { x: from.x, y: minY - 60 },
    { x: to.x, y: minY - 60 },
  ];
  if (!intersectsAny(farBelow)) {
    return farBelow;
  }

  // Fallback: use simple Manhattan even if it overlaps (best effort)
  return manhattanWps;
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

  const fromConfig = resolveConfig(fromGate);
  const toConfig = resolveConfig(toGate);

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

  const fromConfig = resolveConfig(fromGate);
  const toConfig = resolveConfig(toGate);

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

  const fromConfig = getGateConfig(fromGate.type);
  const toConfig = getGateConfig(toGate.type);

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
  const config = getGateConfig(fromGate.type);
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
