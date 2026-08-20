import type { Gate, BoundingBox } from '@/types/circuit';
import { getGateConfig } from './gateConfigs';

// ---------------------------------------------------------------
// Marquee selection utilities
// ---------------------------------------------------------------

/** Normalize a rectangle so width/height are always positive */
const normalizeRect = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): BoundingBox => ({
  x: Math.min(x1, x2),
  y: Math.min(y1, y2),
  width: Math.abs(x2 - x1),
  height: Math.abs(y2 - y1),
});

/** Get the world-space bounding box of a gate */
export const getGateBoundingBox = (gate: Gate): BoundingBox => {
  const config = getGateConfig(gate.type);
  return {
    x: gate.position.x,
    y: gate.position.y,
    width: config.width,
    height: config.height,
  };
};

/** Check if two bounding boxes overlap (AABB intersection) */
export const boxesOverlap = (a: BoundingBox, b: BoundingBox): boolean => {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
};

/** Check if bounding box `inner` is fully contained inside `outer` */
const boxFullyInside = (inner: BoundingBox, outer: BoundingBox): boolean => {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
};

export interface MarqueeResult {
  /** Gate IDs that are fully or partially inside the marquee */
  gateIds: string[];
}

/**
 * Select all gates that intersect a marquee selection box.
 * Works in world coordinates.
 */
export const getGatesInMarquee = (
  gates: Gate[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): MarqueeResult => {
  const box = normalizeRect(x1, y1, x2, y2);

  const gateIds = gates
    .filter((gate) => {
      const gateBox = getGateBoundingBox(gate);
      // Include gates fully inside OR partially overlapping
      return boxFullyInside(gateBox, box) || boxesOverlap(gateBox, box);
    })
    .map((gate) => gate.id);

  return { gateIds };
};

/**
 * Check if a gate is inside a marquee box (world coords).
 */
export const isGateInMarquee = (
  gate: Gate,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean => {
  const box = normalizeRect(x1, y1, x2, y2);
  const gateBox = getGateBoundingBox(gate);
  return boxFullyInside(gateBox, box) || boxesOverlap(gateBox, box);
};
