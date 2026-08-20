// ============================================================
// Wire Utilities — Manhattan routing, validation, hit testing
// ============================================================

import type {
  CircuitState,
  Gate,
  Position,
  Wire,
} from '@/types/circuit';
import { getGateConfig } from '@/utils/gateConfigs';
import { getPortWorldPosition } from '@/components/gates';
import { generateId } from '@/utils/generateId';

// ---------------------------------------------------------------
// Manhattan Routing
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

/**
 * Get the full set of screen-space points for drawing a wire
 * (start → waypoints → end), all in canvas coordinates.
 */
export const getWireScreenPoints = (
  wire: Wire,
  gates: Gate[],
  vp: { zoom: number; offsetX: number; offsetY: number },
): Position[] => {
  const fromGate = gates.find((g) => g.id === wire.fromGateId);
  const toGate = gates.find((g) => g.id === wire.toGateId);
  if (!fromGate || !toGate) return [];

  const fromConfig = getGateConfig(fromGate.type);
  const toConfig = getGateConfig(toGate.type);

  const fromPort = getPortWorldPosition(fromGate, fromConfig, wire.fromPortIndex, false);
  const toPort = getPortWorldPosition(toGate, toConfig, wire.toPortIndex, true);

  const sx = (p: Position): Position => ({
    x: p.x * vp.zoom + vp.offsetX,
    y: p.y * vp.zoom + vp.offsetY,
  });

  const worldWaypoints = computeManhattanRoute(fromPort, toPort);
  return [sx(fromPort), ...worldWaypoints.map(sx), sx(toPort)];
};

/**
 * Get the full set of world-space points for a wire
 * (start → waypoints → end).
 */
export const getWireWorldPoints = (
  wire: Wire,
  gates: Gate[],
): Position[] => {
  const fromGate = gates.find((g) => g.id === wire.fromGateId);
  const toGate = gates.find((g) => g.id === wire.toGateId);
  if (!fromGate || !toGate) return [];

  const fromConfig = getGateConfig(fromGate.type);
  const toConfig = getGateConfig(toGate.type);

  const fromPort = getPortWorldPosition(fromGate, fromConfig, wire.fromPortIndex, false);
  const toPort = getPortWorldPosition(toGate, toConfig, wire.toPortIndex, true);

  const waypoints = computeManhattanRoute(fromPort, toPort);
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
 * Compute screen-space waypoints for a preview wire from a port to the mouse.
 * `mouseWorld` is in world coordinates.
 */
export const getPreviewWirePoints = (
  fromGate: Gate,
  fromPortIndex: number,
  mouseWorld: Position,
): Position[] => {
  const config = getGateConfig(fromGate.type);
  const fromPort = getPortWorldPosition(fromGate, config, fromPortIndex, false);
  const waypoints = computeManhattanRoute(fromPort, mouseWorld);
  return [fromPort, ...waypoints, mouseWorld];
};
