// ============================================================
// Alignment Utilities — snap-to-grid, alignment guides, distribute
// ============================================================

import type { Gate, Position, Viewport } from '@/types/circuit';
import { getGateConfig } from './gateConfigs';
import { isBlockInstance } from './blockUtils';
import { getBlockGateConfig } from './blockUtils';
import type { CustomBlockDefinition } from '@/types/circuit';

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

/** An alignment guide line to display during drag */
export interface AlignmentGuide {
  /** 'h' = horizontal line, 'v' = vertical line */
  orientation: 'h' | 'v';
  /** Position along the perpendicular axis (y for h, x for v) in world coords */
  position: number;
  /** Start of the visible line segment (in screen coords) */
  startX: number;
  startY: number;
  /** End of the visible line segment (in screen coords) */
  endX: number;
  endY: number;
}

/** The result of computing alignment snap during a drag */
export interface AlignmentSnapResult {
  /** The adjusted position after snapping (world coords) */
  position: Position;
  /** Guide lines to render */
  guides: AlignmentGuide[];
}

/** A gate's bounding box with extra info */
interface GateBBox {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/** Get bounding box for a gate in world coords (with custom block support) */
export const getGateWorldBBox = (
  gate: Gate,
  customBlocks: CustomBlockDefinition[],
): GateBBox => {
  let width: number;
  let height: number;

  if (isBlockInstance(gate) && gate.blockId) {
    const blockDef = customBlocks.find((b) => b.id === gate.blockId);
    if (blockDef) {
      const config = getBlockGateConfig(blockDef);
      width = config.width;
      height = config.height;
    } else {
      width = 80;
      height = 60;
    }
  } else {
    const config = getGateConfig(gate.type);
    width = config.width;
    height = config.height;
  }

  const left = gate.position.x;
  const top = gate.position.y;
  const right = gate.position.x + width;
  const bottom = gate.position.y + height;
  const centerX = left + width / 2;
  const centerY = top + height / 2;

  return { id: gate.id, left, right, top, bottom, centerX, centerY };
};

/** Build bounding boxes for a list of gates */
const buildBBoxes = (
  gates: Gate[],
  customBlocks: CustomBlockDefinition[],
): GateBBox[] => gates.map((g) => getGateWorldBBox(g, customBlocks));

/** Get the bounding box of the entire selection group */
export const getSelectionBBox = (
  gates: Gate[],
  customBlocks: CustomBlockDefinition[],
): { left: number; right: number; top: number; bottom: number; centerX: number; centerY: number } | null => {
  if (gates.length === 0) return null;

  const bboxes = buildBBoxes(gates, customBlocks);
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;

  for (const bb of bboxes) {
    if (bb.left < left) left = bb.left;
    if (bb.right > right) right = bb.right;
    if (bb.top < top) top = bb.top;
    if (bb.bottom > bottom) bottom = bb.bottom;
  }

  return {
    left,
    right,
    top,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
};

// ---------------------------------------------------------------
// Snap-to-alignment (during drag)
// ---------------------------------------------------------------

const SNAP_THRESHOLD = 8; // world-space pixels

/**
 * Compute snap position and alignment guides for a dragging selection.
 *
 * `candidatePos` is the top-left of the selection bounding box AFTER the drag delta.
 * We check alignment against all non-selected gates.
 */
export const computeAlignmentSnap = (
  candidatePos: Position,
  selectedBBox: { width: number; height: number },
  allGates: Gate[],
  selectedIds: Set<string>,
  customBlocks: CustomBlockDefinition[],
  canvasWidth: number,
  canvasHeight: number,
  viewport: Viewport,
): AlignmentSnapResult => {
  // The candidate selection bounding box
  const selLeft = candidatePos.x;
  const selTop = candidatePos.y;
  const selRight = selLeft + selectedBBox.width;
  const selBottom = selTop + selectedBBox.height;
  const selCenterX = selLeft + selectedBBox.width / 2;
  const selCenterY = selTop + selectedBBox.height / 2;

  // Other gates (non-selected)
  const otherGates = allGates.filter((g) => !selectedIds.has(g.id));
  const otherBBoxes = buildBBoxes(otherGates, customBlocks);

  // Collect potential snap targets
  interface SnapTarget {
    value: number;      // world value to snap to
    type: 'left' | 'right' | 'centerX' | 'top' | 'bottom' | 'centerY';
    candidateEdge: number; // the edge of the selection that would snap
  }

  const snapTargets: SnapTarget[] = [];

  // For each other gate, check horizontal alignments (left, right, centerX)
  // and vertical alignments (top, bottom, centerY)
  for (const ob of otherBBoxes) {
    // Horizontal alignment candidates (x-axis snap)
    snapTargets.push({ value: ob.left, type: 'left', candidateEdge: selLeft });
    snapTargets.push({ value: ob.right, type: 'right', candidateEdge: selRight });
    snapTargets.push({ value: ob.centerX, type: 'centerX', candidateEdge: selCenterX });

    // Vertical alignment candidates (y-axis snap)
    snapTargets.push({ value: ob.top, type: 'top', candidateEdge: selTop });
    snapTargets.push({ value: ob.bottom, type: 'bottom', candidateEdge: selBottom });
    snapTargets.push({ value: ob.centerY, type: 'centerY', candidateEdge: selCenterY });
  }

  // Find best x snap and y snap independently
  let bestXDelta = SNAP_THRESHOLD + 1;
  let bestXOffset = 0;

  let bestYDelta = SNAP_THRESHOLD + 1;
  let bestYOffset = 0;

  for (const target of snapTargets) {
    const delta = Math.abs(target.candidateEdge - target.value);

    if (delta < SNAP_THRESHOLD) {
      const offset = target.value - target.candidateEdge;

      if (target.type === 'left' || target.type === 'right' || target.type === 'centerX') {
        if (delta < bestXDelta) {
          bestXDelta = delta;
          bestXOffset = offset;
        }
      } else {
        if (delta < bestYDelta) {
          bestYDelta = delta;
          bestYOffset = offset;
        }
      }
    }
  }

  // Apply snap offsets
  const snappedX = selLeft + bestXOffset;
  const snappedY = selTop + bestYOffset;

  // Build guide lines for active snaps
  const guides: AlignmentGuide[] = [];

  // X snap guides (vertical lines)
  if (bestXDelta < SNAP_THRESHOLD) {
    for (const ob of otherBBoxes) {
      const snappedLeft = snappedX;
      const snappedRight = snappedX + selectedBBox.width;
      const snappedCenterX = snappedX + selectedBBox.width / 2;

      let guideX = -1;
      if (Math.abs(snappedLeft - ob.left) < 0.5) guideX = ob.left;
      else if (Math.abs(snappedRight - ob.right) < 0.5) guideX = ob.right;
      else if (Math.abs(snappedCenterX - ob.centerX) < 0.5) guideX = ob.centerX;

      if (guideX >= 0) {
        // Draw a vertical line through this x position
        const screenX = guideX * viewport.zoom + viewport.offsetX;
        guides.push({
          orientation: 'v',
          position: guideX,
          startX: screenX,
          startY: 0,
          endX: screenX,
          endY: canvasHeight,
        });
      }
    }
  }

  // Y snap guides (horizontal lines)
  if (bestYDelta < SNAP_THRESHOLD) {
    for (const ob of otherBBoxes) {
      const snappedTop = snappedY;
      const snappedBottom = snappedY + selectedBBox.height;
      const snappedCenterY = snappedY + selectedBBox.height / 2;

      let guideY = -1;
      if (Math.abs(snappedTop - ob.top) < 0.5) guideY = ob.top;
      else if (Math.abs(snappedBottom - ob.bottom) < 0.5) guideY = ob.bottom;
      else if (Math.abs(snappedCenterY - ob.centerY) < 0.5) guideY = ob.centerY;

      if (guideY >= 0) {
        // Draw a horizontal line through this y position
        const screenY = guideY * viewport.zoom + viewport.offsetY;
        guides.push({
          orientation: 'h',
          position: guideY,
          startX: 0,
          startY: screenY,
          endX: canvasWidth,
          endY: screenY,
        });
      }
    }
  }

  return {
    position: { x: snappedX, y: snappedY },
    guides,
  };
};

// ---------------------------------------------------------------
// Distribute operations
// ---------------------------------------------------------------

/**
 * Distribute selected gates evenly in the horizontal direction.
 * Gates are sorted by x position and spaced evenly between the leftmost and rightmost.
 */
export const distributeHorizontally = (
  gates: Gate[],
  customBlocks: CustomBlockDefinition[],
): Gate[] => {
  if (gates.length < 3) return gates; // need at least 3 to distribute

  const bboxes = buildBBoxes(gates, customBlocks);
  const sorted = [...gates]
    .map((g, i) => ({ gate: g, bbox: bboxes[i] }))
    .sort((a, b) => a.bbox.left - b.bbox.left);

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // Total space between first left edge and last left edge
  const totalSpan = last.bbox.left - first.bbox.left;
  const step = totalSpan / (sorted.length - 1);

  return sorted.map((item, i) => {
    if (i === 0 || i === sorted.length - 1) return item.gate;
    const targetLeft = first.bbox.left + step * i;
    const dx = targetLeft - item.bbox.left;
    return {
      ...item.gate,
      position: { x: item.gate.position.x + dx, y: item.gate.position.y },
    };
  });
};

/**
 * Distribute selected gates evenly in the vertical direction.
 */
export const distributeVertically = (
  gates: Gate[],
  customBlocks: CustomBlockDefinition[],
): Gate[] => {
  if (gates.length < 3) return gates;

  const bboxes = buildBBoxes(gates, customBlocks);
  const sorted = [...gates]
    .map((g, i) => ({ gate: g, bbox: bboxes[i] }))
    .sort((a, b) => a.bbox.top - b.bbox.top);

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const totalSpan = last.bbox.top - first.bbox.top;
  const step = totalSpan / (sorted.length - 1);

  return sorted.map((item, i) => {
    if (i === 0 || i === sorted.length - 1) return item.gate;
    const targetTop = first.bbox.top + step * i;
    const dy = targetTop - item.bbox.top;
    return {
      ...item.gate,
      position: { x: item.gate.position.x, y: item.gate.position.y + dy },
    };
  });
};

// ---------------------------------------------------------------
// Align operations
// ---------------------------------------------------------------

export type AlignDirection = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/**
 * Align selected gates along the specified direction.
 */
export const alignGates = (
  gates: Gate[],
  direction: AlignDirection,
  customBlocks: CustomBlockDefinition[],
): Gate[] => {
  if (gates.length < 2) return gates;

  const bboxes = buildBBoxes(gates, customBlocks);

  // Find the reference value based on alignment direction
  let refValue: number;
  switch (direction) {
    case 'left':
      refValue = Math.min(...bboxes.map((b) => b.left));
      break;
    case 'center':
      refValue = (Math.min(...bboxes.map((b) => b.left)) + Math.max(...bboxes.map((b) => b.right))) / 2;
      break;
    case 'right':
      refValue = Math.max(...bboxes.map((b) => b.right));
      break;
    case 'top':
      refValue = Math.min(...bboxes.map((b) => b.top));
      break;
    case 'middle':
      refValue = (Math.min(...bboxes.map((b) => b.top)) + Math.max(...bboxes.map((b) => b.bottom))) / 2;
      break;
    case 'bottom':
      refValue = Math.max(...bboxes.map((b) => b.bottom));
      break;
  }

  return gates.map((gate, i) => {
    const bb = bboxes[i];
    switch (direction) {
      case 'left':
        return { ...gate, position: { x: refValue, y: gate.position.y } };
      case 'center': {
        const width = bb.right - bb.left;
        return { ...gate, position: { x: refValue - width / 2, y: gate.position.y } };
      }
      case 'right': {
        const w = bb.right - bb.left;
        return { ...gate, position: { x: refValue - w, y: gate.position.y } };
      }
      case 'top':
        return { ...gate, position: { x: gate.position.x, y: refValue } };
      case 'middle': {
        const height = bb.bottom - bb.top;
        return { ...gate, position: { x: gate.position.x, y: refValue - height / 2 } };
      }
      case 'bottom': {
        const h = bb.bottom - bb.top;
        return { ...gate, position: { x: gate.position.x, y: refValue - h } };
      }
    }
  });
};
