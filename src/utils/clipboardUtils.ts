// ============================================================
// Clipboard Utilities — serialize / deserialize for copy/paste
// ============================================================

import type { CircuitState, Gate, Wire, ElementId } from '@/types/circuit';
import { generateId } from '@/utils/generateId';

// ---------------------------------------------------------------
// Clipboard data structure
// ---------------------------------------------------------------

/** Serialized clipboard payload stored in localStorage */
export interface ClipboardData {
  gates: Gate[];
  /** Internal wires — those whose both endpoints are in the copied gate set */
  internalWires: Wire[];
  /** The offset (top-left corner) of the copied selection, used for paste positioning */
  originX: number;
  originY: number;
  /** Timestamp so we can detect stale data */
  timestamp: number;
}

const CLIPBOARD_STORAGE_KEY = 'logic-sim-clipboard';

// ---------------------------------------------------------------
// Copy: extract selected gates + internal wires
// ---------------------------------------------------------------

/**
 * Build a ClipboardData from the current circuit and a set of selected gate IDs.
 * Only wires whose `fromGateId` AND `toGateId` are both in the selection are included.
 */
export const copySelection = (
  circuit: CircuitState,
  selectedGateIds: ElementId[],
): ClipboardData | null => {
  if (selectedGateIds.length === 0) return null;

  const selectedSet = new Set(selectedGateIds);

  const gates = circuit.gates.filter((g) => selectedSet.has(g.id));

  // Only keep wires whose both ends are inside the selection
  const internalWires = circuit.wires.filter(
    (w) => selectedSet.has(w.fromGateId) && selectedSet.has(w.toGateId),
  );

  // Compute bounding-box origin for paste positioning
  let minX = Infinity;
  let minY = Infinity;
  for (const gate of gates) {
    if (gate.position.x < minX) minX = gate.position.x;
    if (gate.position.y < minY) minY = gate.position.y;
  }

  const data: ClipboardData = {
    gates,
    internalWires,
    originX: minX,
    originY: minY,
    timestamp: Date.now(),
  };

  return data;
};

// ---------------------------------------------------------------
// Paste: deserialize, remap IDs, offset positions
// ---------------------------------------------------------------

export interface PasteResult {
  newGates: Gate[];
  newWires: Wire[];
}

/**
 * Given ClipboardData and a paste position (world coords), produce new gates
 * with unique IDs and wires remapped to those new IDs.
 *
 * `pastePosition` is where the top-left of the selection should land.
 * The original selection's origin is used to compute the delta.
 */
export const deserializePaste = (
  data: ClipboardData,
  pastePosition: { x: number; y: number },
): PasteResult => {
  // Build an old-id → new-id map
  const idMap = new Map<ElementId, ElementId>();
  for (const gate of data.gates) {
    idMap.set(gate.id, generateId());
  }

  // Compute the offset from original origin to paste position
  const dx = pastePosition.x - data.originX;
  const dy = pastePosition.y - data.originY;

  // Clone gates with new IDs and shifted positions
  const newGates: Gate[] = data.gates.map((g) => ({
    ...g,
    id: idMap.get(g.id)!,
    position: {
      x: g.position.x + dx,
      y: g.position.y + dy,
    },
    outputState: false, // reset state on paste
  }));

  // Clone internal wires with remapped gate IDs and new wire IDs
  const newWires: Wire[] = data.internalWires.map((w) => ({
    ...w,
    id: generateId(),
    fromGateId: idMap.get(w.fromGateId)!,
    toGateId: idMap.get(w.toGateId)!,
    signal: false,
  }));

  return { newGates, newWires };
};

// ---------------------------------------------------------------
// LocalStorage persistence
// ---------------------------------------------------------------

/** Persist clipboard data to localStorage */
export const persistClipboard = (data: ClipboardData): void => {
  try {
    localStorage.setItem(CLIPBOARD_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage may be full or unavailable — silently fail
  }
};

/** Load clipboard data from localStorage, or null if none / invalid */
export const loadClipboard = (): ClipboardData | null => {
  try {
    const raw = localStorage.getItem(CLIPBOARD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClipboardData;
    if (!parsed.gates || !Array.isArray(parsed.gates)) return null;
    return parsed;
  } catch {
    return null;
  }
};

/** Clear persisted clipboard */
export const clearPersistedClipboard = (): void => {
  try {
    localStorage.removeItem(CLIPBOARD_STORAGE_KEY);
  } catch {
    // silently fail
  }
};
