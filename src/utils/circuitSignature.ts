// ============================================================
// Structural comparison
//
// Simulation results (gate outputs, wire signals) change constantly.
// Undo history and autosave should only react to *edits*, so both
// compare this signature instead of the whole circuit.
// ============================================================

import type { CircuitState } from '@/types/circuit';

/** A string that changes only when the circuit is structurally edited */
export const circuitSignature = (circuit: CircuitState): string => {
  const gates = circuit.gates
    .map((g) =>
      [
        g.id,
        g.type,
        Math.round(g.position.x),
        Math.round(g.position.y),
        g.inputCount ?? '',
        g.label ?? '',
        g.blockId ?? '',
        // An INPUT's value is an edit, not a simulation result
        g.type === 'INPUT' ? (g.outputState ? 1 : 0) : '',
      ].join(','),
    )
    .sort()
    .join('|');

  const wires = circuit.wires
    .map((w) =>
      [w.id, w.fromGateId, w.fromPortIndex, w.toGateId, w.toPortIndex].join(','),
    )
    .sort()
    .join('|');

  return `${gates}#${wires}`;
};

/** True when two circuits differ only by simulation state */
export const structurallyEqual = (a: CircuitState, b: CircuitState): boolean =>
  circuitSignature(a) === circuitSignature(b);
