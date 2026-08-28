// ============================================================
// Block Utilities — analyze selections, build/expand block defs
// ============================================================

import type {
  CircuitState,
  CustomBlockDefinition,
  ElementId,
  Gate,
  Wire,
} from '@/types/circuit';
import { generateId } from '@/utils/generateId';

// ---------------------------------------------------------------
// Selection analysis: find input/output ports
// ---------------------------------------------------------------

export interface SelectionAnalysis {
  /** INPUT gates with no incoming wires → block input ports */
  inputGates: Gate[];
  /** OUTPUT gates with no outgoing wires → block output ports */
  outputGates: Gate[];
  /** All gates in the selection */
  allGates: Gate[];
  /** Wires fully inside the selection */
  internalWires: Wire[];
  /** Gates whose wires cross the selection boundary (need special handling) */
  boundaryGates: Gate[];
}

/**
 * Analyze a selection of gates to determine block input/output ports.
 *
 * Input ports = INPUT gates with no incoming wires from outside the selection.
 * Output ports = OUTPUT gates with no outgoing wires to outside the selection.
 */
export const analyzeSelection = (
  circuit: CircuitState,
  selectedGateIds: ElementId[],
): SelectionAnalysis | null => {
  if (selectedGateIds.length === 0) return null;

  const selectedSet = new Set(selectedGateIds);

  const allGates = circuit.gates.filter((g) => selectedSet.has(g.id));

  // Internal wires: both endpoints inside selection
  const internalWires = circuit.wires.filter(
    (w) => selectedSet.has(w.fromGateId) && selectedSet.has(w.toGateId),
  );

  // External wires: one endpoint inside, one outside
  const externalWires = circuit.wires.filter(
    (w) =>
      (selectedSet.has(w.fromGateId) && !selectedSet.has(w.toGateId)) ||
      (!selectedSet.has(w.fromGateId) && selectedSet.has(w.toGateId)),
  );

  // INPUT gates with no incoming wires from outside the selection
  const inputGates = allGates.filter((gate) => {
    if (gate.type !== 'INPUT') return false;
    // Check if any external wire connects TO this gate
    const hasExternalInput = externalWires.some(
      (w) => w.toGateId === gate.id && !selectedSet.has(w.fromGateId),
    );
    return !hasExternalInput;
  });

  // OUTPUT gates with no outgoing wires to outside the selection
  const outputGates = allGates.filter((gate) => {
    if (gate.type !== 'OUTPUT') return false;
    // Check if any external wire connects FROM this gate
    const hasExternalOutput = externalWires.some(
      (w) => w.fromGateId === gate.id && !selectedSet.has(w.toGateId),
    );
    return !hasExternalOutput;
  });

  // Boundary gates: gates that have external wire connections
  const boundaryGateIds = new Set<ElementId>();
  for (const w of externalWires) {
    if (selectedSet.has(w.fromGateId)) boundaryGateIds.add(w.fromGateId);
    if (selectedSet.has(w.toGateId)) boundaryGateIds.add(w.toGateId);
  }
  const boundaryGates = allGates.filter((g) => boundaryGateIds.has(g.id));

  return {
    inputGates,
    outputGates,
    allGates,
    internalWires,
    boundaryGates,
  };
};

// ---------------------------------------------------------------
// Build block definition from selection
// ---------------------------------------------------------------

/**
 * Build a CustomBlockDefinition from the selected gates.
 * Positions are made relative to the bounding box origin.
 */
export const buildBlockDefinition = (
  name: string,
  description: string,
  icon: string,
  circuit: CircuitState,
  selectedGateIds: ElementId[],
): CustomBlockDefinition | null => {
  const analysis = analyzeSelection(circuit, selectedGateIds);
  if (!analysis) return null;

  // Need at least one input and one output
  if (analysis.inputGates.length === 0 && analysis.outputGates.length === 0) {
    return null;
  }

  // Compute bounding box origin
  let minX = Infinity;
  let minY = Infinity;
  for (const gate of analysis.allGates) {
    if (gate.position.x < minX) minX = gate.position.x;
    if (gate.position.y < minY) minY = gate.position.y;
  }

  // Create a mapping from old gate IDs to new IDs for the block definition
  const idMap = new Map<ElementId, ElementId>();
  for (const gate of analysis.allGates) {
    idMap.set(gate.id, generateId());
  }

  // Clone gates with relative positions and new IDs
  const internalGates: Gate[] = analysis.allGates.map((g) => ({
    ...g,
    id: idMap.get(g.id)!,
    position: {
      x: g.position.x - minX,
      y: g.position.y - minY,
    },
    outputState: false,
  }));

  // Clone internal wires with remapped gate IDs
  const internalWires: Wire[] = analysis.internalWires.map((w) => ({
    ...w,
    id: generateId(),
    fromGateId: idMap.get(w.fromGateId)!,
    toGateId: idMap.get(w.toGateId)!,
    signal: false,
  }));

  // Build input port mappings (using new IDs)
  const inputPorts = analysis.inputGates.map((gate, i) => ({
    internalGateId: idMap.get(gate.id)!,
    portIndex: 0,
    name: `in${i}`,
  }));

  // Build output port mappings (using new IDs)
  const outputPorts = analysis.outputGates.map((gate, i) => ({
    internalGateId: idMap.get(gate.id)!,
    portIndex: 0,
    name: `out${i}`,
  }));

  return {
    id: generateId(),
    name,
    description,
    icon,
    internalGates,
    internalWires,
    inputPorts,
    outputPorts,
    timestamp: Date.now(),
  };
};

// Block geometry lives in gateConfigs so every module resolves it the same way.
export { getBlockGateConfig } from '@/utils/gateConfigs';

// ---------------------------------------------------------------
// Create a block instance gate
// ---------------------------------------------------------------

/**
 * Create a new Gate that represents an instance of a custom block.
 */
export const createBlockInstance = (
  blockId: ElementId,
  position: { x: number; y: number },
): Gate => ({
  id: generateId(),
  type: 'BLOCK',
  position,
  outputState: false,
  blockId,
});

// ---------------------------------------------------------------
// Expand a block instance to its internal gates + wires
// ---------------------------------------------------------------

/**
 * Given a block definition and an instance position, produce the
 * internal gates (with world-space positions) and wires needed to
 * render the block in edit mode.
 */
export const expandBlockInstance = (
  blockDef: CustomBlockDefinition,
  instancePosition: { x: number; y: number },
): { gates: Gate[]; wires: Wire[] } => {
  // Create new IDs for the expanded gates
  const idMap = new Map<ElementId, ElementId>();
  for (const g of blockDef.internalGates) {
    idMap.set(g.id, generateId());
  }

  const gates: Gate[] = blockDef.internalGates.map((g) => ({
    ...g,
    id: idMap.get(g.id)!,
    position: {
      x: instancePosition.x + g.position.x,
      y: instancePosition.y + g.position.y,
    },
    outputState: false,
  }));

  const wires: Wire[] = blockDef.internalWires.map((w) => ({
    ...w,
    id: generateId(),
    fromGateId: idMap.get(w.fromGateId)!,
    toGateId: idMap.get(w.toGateId)!,
    signal: false,
  }));

  return { gates, wires };
};

// ---------------------------------------------------------------
// Get a display type label for a block gate
// ---------------------------------------------------------------

/** Check if a gate is a custom block instance */
export const isBlockInstance = (gate: Gate): boolean => {
  return gate.blockId !== undefined && gate.blockId !== null;
};
