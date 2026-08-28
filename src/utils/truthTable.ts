// ============================================================
// Truth table generation
//
// Enumerates every combination of the circuit's INPUT switches and
// records what each OUTPUT probe does. Sequential circuits get a
// fresh memory store per row so a table is reproducible.
// ============================================================

import type { CircuitState, CustomBlockDefinition, Gate } from '@/types/circuit';
import { SEQUENTIAL_TYPES } from '@/types/circuit';
import { evaluateCircuit } from '@/utils/simulation';

/** Above this many switches the table is too large to be useful */
export const MAX_TRUTH_TABLE_INPUTS = 10;

export interface TruthTableColumn {
  id: string;
  label: string;
}

export interface TruthTableRow {
  inputs: boolean[];
  outputs: boolean[];
}

export interface TruthTable {
  inputs: TruthTableColumn[];
  outputs: TruthTableColumn[];
  rows: TruthTableRow[];
  /** True when the circuit has more switches than we will enumerate */
  truncated: boolean;
  /**
   * True when the circuit contains memory. The table still renders,
   * but it shows the settled response to each input combination from
   * a cleared state, not the circuit's full behaviour over time.
   */
  sequential: boolean;
}

/** Reading order: left to right, then top to bottom */
const byPosition = (a: Gate, b: Gate): number =>
  a.position.x - b.position.x || a.position.y - b.position.y;

const autoLabel = (index: number): string => {
  // A..Z, then A1, B1, ...
  const letter = String.fromCharCode(65 + (index % 26));
  const wrap = Math.floor(index / 26);
  return wrap === 0 ? letter : `${letter}${wrap}`;
};

const containsSequential = (
  circuit: CircuitState,
  blocks: CustomBlockDefinition[],
): boolean => {
  const seen = new Set<string>();
  const scan = (gates: Gate[], depth: number): boolean => {
    if (depth > 8) return false;
    for (const g of gates) {
      if (SEQUENTIAL_TYPES.includes(g.type)) return true;
      if (g.blockId && !seen.has(g.blockId)) {
        seen.add(g.blockId);
        const def = blocks.find((b) => b.id === g.blockId);
        if (def && scan(def.internalGates, depth + 1)) return true;
      }
    }
    return false;
  };
  return scan(circuit.gates, 0);
};

/**
 * Build a truth table for the circuit's INPUT → OUTPUT behaviour.
 * The supplied circuit is never mutated.
 */
export const buildTruthTable = (
  circuit: CircuitState,
  blocks: CustomBlockDefinition[] = [],
): TruthTable => {
  const inputGates = circuit.gates.filter((g) => g.type === 'INPUT').sort(byPosition);
  const outputGates = circuit.gates.filter((g) => g.type === 'OUTPUT').sort(byPosition);

  const truncated = inputGates.length > MAX_TRUTH_TABLE_INPUTS;
  const used = truncated ? inputGates.slice(0, MAX_TRUTH_TABLE_INPUTS) : inputGates;

  const inputs: TruthTableColumn[] = used.map((g, i) => ({
    id: g.id,
    label: g.label?.trim() || autoLabel(i),
  }));
  const outputs: TruthTableColumn[] = outputGates.map((g, i) => ({
    id: g.id,
    label: g.label?.trim() || `Y${outputGates.length > 1 ? i : ''}`,
  }));

  const rows: TruthTableRow[] = [];
  if (inputs.length === 0 || outputs.length === 0) {
    return { inputs, outputs, rows, truncated, sequential: false };
  }

  const sequential = containsSequential(circuit, blocks);
  const indexOfInput = new Map(used.map((g, i) => [g.id, i]));
  const combos = 2 ** used.length;

  for (let mask = 0; mask < combos; mask++) {
    // Bit 0 is the *last* column, so the table counts up conventionally
    const values = used.map((_, i) => Boolean((mask >> (used.length - 1 - i)) & 1));

    const gates = circuit.gates.map((g) => {
      const idx = indexOfInput.get(g.id);
      if (idx !== undefined) return { ...g, outputState: values[idx] };
      // Clear memory so each row starts from a known state
      return SEQUENTIAL_TYPES.includes(g.type) ? { ...g, memory: {} } : g;
    });

    const { circuit: settled } = evaluateCircuit(
      { ...circuit, gates },
      { blocks, memoryStore: new Map() },
    );

    rows.push({
      inputs: values,
      outputs: outputs.map(
        (col) => settled.gates.find((g) => g.id === col.id)?.outputState ?? false,
      ),
    });
  }

  return { inputs, outputs, rows, truncated, sequential };
};

/**
 * Sum-of-products expression for one output column, built from its
 * minterms. Not minimised — it is a faithful readout of the table.
 */
export const sumOfProducts = (table: TruthTable, outputIndex: number): string => {
  const minterms = table.rows.filter((r) => r.outputs[outputIndex]);
  if (minterms.length === 0) return '0';
  if (minterms.length === table.rows.length) return '1';

  return minterms
    .map((row) =>
      row.inputs
        .map((v, i) => (v ? table.inputs[i].label : `${table.inputs[i].label}'`))
        .join('·'),
    )
    .join(' + ');
};
