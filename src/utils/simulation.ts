// ============================================================
// Simulation Engine — evaluates circuit logic each tick
// ============================================================

import type { CircuitState, Gate, Wire } from '@/types/circuit';

/** Maximum iterations for feedback-loop evaluation */
const MAX_FEEDBACK_ITERATIONS = 100;

// ---------------------------------------------------------------
// Gate evaluation
// ---------------------------------------------------------------

/**
 * Resolve the boolean input signals for a gate by reading the
 * wires connected to its input ports.
 */
const resolveInputs = (gate: Gate, wires: Wire[]): boolean[] => {
  const inputWires = wires.filter(
    (w) => w.toGateId === gate.id,
  );

  // Gather inputs keyed by portIndex
  const maxPort =
    inputWires.length > 0
      ? Math.max(...inputWires.map((w) => w.toPortIndex))
      : -1;

  const inputs: boolean[] = new Array(maxPort + 1).fill(false);
  for (const wire of inputWires) {
    inputs[wire.toPortIndex] = wire.signal;
  }
  return inputs;
};

/**
 * Compute the output of a single gate given its input signals.
 * Returns `null` for INPUT gates (their state is user-managed)
 * and for OUTPUT gates (LEDs don't produce output).
 */
const evaluateGate = (
  gate: Gate,
  inputs: boolean[],
): boolean | null => {
  switch (gate.type) {
    case 'INPUT':
      // Source gate — output is whatever the user has toggled it to
      return gate.outputState;

    case 'OUTPUT':
      // LED display — no output, but it shows the input
      return null;

    case 'CONSTANT_HIGH':
      // Always outputs 1
      return true;

    case 'CONSTANT_LOW':
      // Always outputs 0
      return false;

    case 'NOT':
      return !inputs[0];

    case 'AND':
      return inputs[0] && inputs[1];

    case 'OR':
      return inputs[0] || inputs[1];

    case 'NAND':
      return !(inputs[0] && inputs[1]);

    case 'NOR':
      return !(inputs[0] || inputs[1]);

    case 'XOR':
      return inputs[0] !== inputs[1];

    case 'XNOR':
      return inputs[0] === inputs[1];

    default:
      return false;
  }
};

// ---------------------------------------------------------------
// Dependency / topological ordering
// ---------------------------------------------------------------

/**
 * Build a dependency map: gateId → set of gateIds that feed into it.
 */
const buildDependencyMap = (
  gates: Gate[],
  wires: Wire[],
): Map<string, Set<string>> => {
  const deps = new Map<string, Set<string>>();
  for (const gate of gates) {
    deps.set(gate.id, new Set());
  }
  for (const wire of wires) {
    const targetSet = deps.get(wire.toGateId);
    if (targetSet) {
      targetSet.add(wire.fromGateId);
    }
  }
  return deps;
};

/**
 * Return gates in a topological order using Kahn's algorithm.
 * INPUT gates have no dependencies and always come first.
 * If the graph has cycles, the remaining nodes are appended in
 * their original order (fallback for iterative evaluation).
 */
const topologicalSort = (gates: Gate[], wires: Wire[]): Gate[] => {
  const gateMap = new Map(gates.map((g) => [g.id, g]));

  // Count incoming edges per gate
  const inDeg = new Map<string, number>();
  for (const gate of gates) {
    inDeg.set(gate.id, 0);
  }
  for (const wire of wires) {
    inDeg.set(wire.toGateId, (inDeg.get(wire.toGateId) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const gate of gates) {
    if ((inDeg.get(gate.id) ?? 0) === 0) {
      queue.push(gate.id);
    }
  }

  const sorted: Gate[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const gate = gateMap.get(id);
    if (gate) sorted.push(gate);

    // Find all gates that depend on this one
    for (const wire of wires) {
      if (wire.fromGateId === id) {
        const deg = (inDeg.get(wire.toGateId) ?? 1) - 1;
        inDeg.set(wire.toGateId, deg);
        if (deg === 0) {
          queue.push(wire.toGateId);
        }
      }
    }
  }

  // Append any nodes not visited (cycles)
  for (const gate of gates) {
    if (!visited.has(gate.id)) {
      sorted.push(gate);
    }
  }

  return sorted;
};

// ---------------------------------------------------------------
// Main simulation step
// ---------------------------------------------------------------

/**
 * Run a single simulation step on the circuit.
 * Returns a new CircuitState with updated gate outputState and
 * wire signal values.
 *
 * Uses topological sort for acyclic sub-circuits and iterative
 * evaluation (up to MAX_FEEDBACK_ITERATIONS) for feedback loops.
 */
export const simulationStep = (circuit: CircuitState): CircuitState => {
  const gates = circuit.gates.map((g) => ({ ...g }));
  const wires = circuit.wires.map((w) => ({ ...w }));

  const gateMap = new Map(gates.map((g) => [g.id, g]));
  const sorted = topologicalSort(gates, wires);

  // Detect if there are cycles (gates not in topological order that
  // feed back into earlier gates)
  const deps = buildDependencyMap(gates, wires);
  let hasCycles = false;
  for (const gate of sorted) {
    const gateDeps = deps.get(gate.id);
    if (!gateDeps) continue;
    for (const depId of gateDeps) {
      const depIndex = sorted.findIndex((g) => g.id === depId);
      const gateIndex = sorted.findIndex((g) => g.id === gate.id);
      if (depIndex > gateIndex) {
        hasCycles = true;
        break;
      }
    }
    if (hasCycles) break;
  }

  if (hasCycles) {
    // Iterative evaluation with max iterations
    let changed = true;
    let iterations = 0;

    while (changed && iterations < MAX_FEEDBACK_ITERATIONS) {
      changed = false;
      iterations++;

      // Update wire signals from current gate outputs
      for (const wire of wires) {
        const fromGate = gateMap.get(wire.fromGateId);
        if (fromGate) {
          const newSignal = fromGate.outputState;
          if (wire.signal !== newSignal) {
            wire.signal = newSignal;
            changed = true;
          }
        }
      }

      // Evaluate gates in topological order
      for (const gate of sorted) {
        if (gate.type === 'INPUT') continue; // user-managed

        const inputs = resolveInputs(gate, wires);
        const result = evaluateGate(gate, inputs);

        if (result !== null && gate.outputState !== result) {
          gate.outputState = result;
          changed = true;
        }
      }
    }
  } else {
    // Acyclic — single pass in topological order is sufficient
    // First, propagate signals through wires from source gates
    for (const wire of wires) {
      const fromGate = gateMap.get(wire.fromGateId);
      if (fromGate) {
        wire.signal = fromGate.outputState;
      }
    }

    // Evaluate each gate
    for (const gate of sorted) {
      if (gate.type === 'INPUT') continue;

      const inputs = resolveInputs(gate, wires);
      const result = evaluateGate(gate, inputs);

      if (result !== null) {
        gate.outputState = result;
      }

      // Update wires connected to this gate's output
      for (const wire of wires) {
        if (wire.fromGateId === gate.id && result !== null) {
          wire.signal = result;
        }
      }
    }
  }

  return {
    ...circuit,
    gates,
    wires,
  };
};

// ---------------------------------------------------------------
// Toggle INPUT gate
// ---------------------------------------------------------------

/** Toggle an INPUT gate's outputState and return updated circuit */
export const toggleInputGate = (
  circuit: CircuitState,
  gateId: string,
): CircuitState => {
  const gates = circuit.gates.map((g) => {
    if (g.id === gateId && g.type === 'INPUT') {
      return { ...g, outputState: !g.outputState };
    }
    return g;
  });
  return { ...circuit, gates };
};
