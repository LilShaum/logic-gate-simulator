// ============================================================
// The circuit the app opens with when there is nothing saved.
//
// A wired half adder: it demonstrates XOR, AND, switches and LEDs,
// and it produces a readable truth table straight away.
// ============================================================

import type { CircuitState, Gate, Wire } from '@/types/circuit';
import { generateId } from '@/utils/generateId';

export const createDemoCircuit = (): CircuitState => {
  const inA: Gate = {
    id: generateId(),
    type: 'INPUT',
    position: { x: 120, y: 150 },
    outputState: false,
    label: 'A',
  };
  const inB: Gate = {
    id: generateId(),
    type: 'INPUT',
    position: { x: 120, y: 290 },
    outputState: true,
    label: 'B',
  };
  const xor: Gate = {
    id: generateId(),
    type: 'XOR',
    position: { x: 320, y: 150 },
    outputState: false,
  };
  const and: Gate = {
    id: generateId(),
    type: 'AND',
    position: { x: 320, y: 270 },
    outputState: false,
  };
  const sum: Gate = {
    id: generateId(),
    type: 'OUTPUT',
    position: { x: 520, y: 160 },
    outputState: false,
    label: 'SUM',
  };
  const carry: Gate = {
    id: generateId(),
    type: 'OUTPUT',
    position: { x: 520, y: 280 },
    outputState: false,
    label: 'CARRY',
  };

  const connect = (
    from: Gate,
    fromPortIndex: number,
    to: Gate,
    toPortIndex: number,
  ): Wire => ({
    id: generateId(),
    fromGateId: from.id,
    fromPortIndex,
    toGateId: to.id,
    toPortIndex,
    signal: false,
    waypoints: [],
  });

  return {
    gates: [inA, inB, xor, and, sum, carry],
    wires: [
      connect(inA, 0, xor, 0),
      connect(inB, 0, xor, 1),
      connect(inA, 0, and, 0),
      connect(inB, 0, and, 1),
      connect(xor, 0, sum, 0),
      connect(and, 0, carry, 0),
    ],
    selectedElementId: null,
    selectedGateIds: [],
  };
};
