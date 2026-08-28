import type { CircuitState, Gate, GateType, Wire } from '@/types/circuit';

let counter = 0;
export const nextId = (prefix = 'n') => `${prefix}${++counter}`;

export const gate = (type: GateType, extra: Partial<Gate> = {}): Gate => ({
  id: nextId('g'),
  type,
  position: { x: 0, y: 0 },
  outputState: false,
  ...extra,
});

export const wire = (
  from: Gate,
  fromPort: number,
  to: Gate,
  toPort: number,
): Wire => ({
  id: nextId('w'),
  fromGateId: from.id,
  fromPortIndex: fromPort,
  toGateId: to.id,
  toPortIndex: toPort,
  signal: false,
  waypoints: [],
});

export const circuit = (gates: Gate[], wires: Wire[]): CircuitState => ({
  gates,
  wires,
  selectedElementId: null,
  selectedGateIds: [],
});

/** Read a gate's settled output out of an evaluated circuit */
export const outOf = (c: CircuitState, g: Gate, port = 0): boolean =>
  c.gates.find((x) => x.id === g.id)?.outputStates?.[port] ?? false;
