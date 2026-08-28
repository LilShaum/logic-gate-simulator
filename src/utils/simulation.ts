// ============================================================
// Simulation engine
//
// The circuit the user draws is *not* what gets evaluated.
// Custom blocks are first flattened into a netlist of primitive
// nodes, so a block behaves exactly like the gates inside it —
// including blocks nested inside other blocks.
//
// Evaluation of one pass:
//   1. settle the combinational network to a fixed point
//   2. advance free-running clocks (only when a tick is requested)
//   3. apply edge-triggered elements once, from the settled inputs
//   4. settle again so the new flip-flop outputs propagate
// ============================================================

import type {
  CircuitState,
  CustomBlockDefinition,
  ElementId,
  Gate,
  GateMemory,
  GateType,
} from '@/types/circuit';
import { clampFanIn, naturalArity } from '@/utils/gateConfigs';

/** Iterations allowed before a network is declared oscillating */
export const MAX_SETTLE_ITERATIONS = 200;

/** How deep custom blocks may nest before we stop expanding */
const MAX_BLOCK_DEPTH = 12;

/** Default half-period, in ticks, for a CLOCK primitive */
export const DEFAULT_CLOCK_PERIOD = 4;

// ---------------------------------------------------------------
// Netlist types
// ---------------------------------------------------------------

/** A reference to one output port of one node */
interface Ref {
  node: string;
  port: number;
}

interface Node {
  id: string;
  type: GateType;
  /** Driver for each input port; null means "not connected" (reads low) */
  inputs: (Ref | null)[];
  /** Current value of each output port */
  out: boolean[];
  memory: GateMemory;
  /** Top-level gate this node *is*, when it maps 1:1 to one */
  gateId: ElementId | null;
}

export interface Netlist {
  nodes: Map<string, Node>;
  /** Evaluation order: topological, with cycle members appended */
  order: string[];
  /** Where to read a circuit-level gate's output port from */
  outMap: Map<string, Ref>;
  /** Which node inputs a circuit-level gate's input port feeds */
  inMap: Map<string, Ref[]>;
}

/** Persistent state for sequential elements living inside blocks */
export type MemoryStore = Map<string, GateMemory>;

const portKey = (gateId: string, port: number) => `${gateId}:${port}`;

const isEdgeTriggered = (type: GateType): boolean =>
  type === 'D_FLIPFLOP' || type === 'T_FLIPFLOP';

const isSequential = (type: GateType): boolean =>
  isEdgeTriggered(type) || type === 'CLOCK' || type === 'SR_LATCH';

/** How many input ports a primitive node has */
const nodeInputCount = (type: GateType, gate?: Gate): number => {
  if (gate) return clampFanIn(type, gate.inputCount);
  return naturalArity(type);
};

/** How many output ports a primitive node has */
const nodeOutputCount = (type: GateType): number => {
  switch (type) {
    case 'OUTPUT':
      // Modelled as a pass-through so it can drive a block's output port
      return 1;
    case 'D_FLIPFLOP':
    case 'T_FLIPFLOP':
    case 'SR_LATCH':
      return 2;
    default:
      return 1;
  }
};

// ---------------------------------------------------------------
// Combinational truth
// ---------------------------------------------------------------

/**
 * Pure combinational output for a primitive.
 * Sequential primitives are handled separately and are not passed here,
 * except SR_LATCH which is level-sensitive and settles like logic.
 */
export const evaluatePrimitive = (
  type: GateType,
  inputs: boolean[],
  node?: Node,
): boolean[] => {
  const anyHigh = inputs.some(Boolean);
  const allHigh = inputs.length > 0 && inputs.every(Boolean);
  const oddHigh = inputs.reduce((n, v) => n + (v ? 1 : 0), 0) % 2 === 1;

  switch (type) {
    case 'INPUT':
      // Value is user-managed; caller keeps the existing output
      return node ? node.out.slice() : [false];
    case 'CLOCK':
      return node ? node.out.slice() : [false];
    case 'OUTPUT':
    case 'BUFFER':
      return [inputs[0] ?? false];
    case 'NOT':
      return [!(inputs[0] ?? false)];
    case 'CONSTANT_HIGH':
      return [true];
    case 'CONSTANT_LOW':
      return [false];
    case 'AND':
      return [allHigh];
    case 'OR':
      return [anyHigh];
    case 'NAND':
      return [!allHigh];
    case 'NOR':
      return [!anyHigh];
    case 'XOR':
      return [oddHigh];
    case 'XNOR':
      return [!oddHigh];
    case 'SR_LATCH': {
      const [s, r] = [inputs[0] ?? false, inputs[1] ?? false];
      const held = node?.memory.q ?? false;
      // S=1 sets, R=1 clears, both high is the forbidden state (we clear),
      // both low holds the stored value.
      const q = s && !r ? true : r ? false : held;
      if (node) node.memory.q = q;
      return [q, !q];
    }
    case 'D_FLIPFLOP':
    case 'T_FLIPFLOP': {
      const q = node?.memory.q ?? false;
      return [q, !q];
    }
    default:
      return [false];
  }
};

// ---------------------------------------------------------------
// Flattening: circuit (+ blocks) -> primitive netlist
// ---------------------------------------------------------------

const makeNode = (
  id: string,
  type: GateType,
  inputCount: number,
  gateId: ElementId | null,
  memory: GateMemory,
): Node => ({
  id,
  type,
  inputs: new Array(inputCount).fill(null),
  out: new Array(nodeOutputCount(type)).fill(false),
  memory,
  gateId,
});

/**
 * Build a primitive-only netlist from a circuit, expanding every
 * custom block instance (recursively) into its internal gates.
 */
export const buildNetlist = (
  circuit: CircuitState,
  blocks: CustomBlockDefinition[] = [],
  memoryStore: MemoryStore = new Map(),
): Netlist => {
  const nodes = new Map<string, Node>();
  const outMap = new Map<string, Ref>();
  const inMap = new Map<string, Ref[]>();
  const blockById = new Map(blocks.map((b) => [b.id, b]));

  /** Memory for a node inside a block: persisted across evaluations */
  const blockMemory = (nodeId: string): GateMemory => {
    let m = memoryStore.get(nodeId);
    if (!m) {
      m = {};
      memoryStore.set(nodeId, m);
    }
    return m;
  };

  const expandBlock = (
    instanceId: string,
    def: CustomBlockDefinition,
    prefix: string,
    depth: number,
  ) => {
    if (depth > MAX_BLOCK_DEPTH) return;

    const localOut = new Map<string, Ref>();
    const localIn = new Map<string, Ref[]>();

    for (const ig of def.internalGates) {
      const nodeId = prefix + ig.id;
      const nestedDef = ig.blockId ? blockById.get(ig.blockId) : undefined;

      if (nestedDef) {
        const nestedPrefix = `${nodeId}/`;
        const before = { outMap: new Map(outMap), inMap: new Map(inMap) };
        expandBlock(nodeId, nestedDef, nestedPrefix, depth + 1);
        // Nested expansion registers its ports under `nodeId` in the
        // shared maps; move them into the local scope for wiring.
        for (const [k, v] of outMap) {
          if (k.startsWith(`${nodeId}:`) && !before.outMap.has(k)) localOut.set(k, v);
        }
        for (const [k, v] of inMap) {
          if (k.startsWith(`${nodeId}:`) && !before.inMap.has(k)) localIn.set(k, v);
        }
        continue;
      }

      const n = makeNode(
        nodeId,
        ig.type,
        nodeInputCount(ig.type, ig),
        null,
        isSequential(ig.type) ? blockMemory(nodeId) : {},
      );
      // A block-internal INPUT gate that is not exposed as a port keeps
      // whatever constant the author left it at.
      if (ig.type === 'INPUT') n.out[0] = ig.outputState;
      nodes.set(nodeId, n);
      for (let i = 0; i < n.out.length; i++) localOut.set(portKey(nodeId, i), { node: nodeId, port: i });
      for (let i = 0; i < n.inputs.length; i++) localIn.set(portKey(nodeId, i), [{ node: nodeId, port: i }]);
    }

    // Wire up the block's internals
    for (const w of def.internalWires) {
      const src = localOut.get(portKey(prefix + w.fromGateId, w.fromPortIndex));
      const dsts = localIn.get(portKey(prefix + w.toGateId, w.toPortIndex));
      if (!src || !dsts) continue;
      for (const d of dsts) {
        const n = nodes.get(d.node);
        if (n) n.inputs[d.port] = src;
      }
    }

    // Expose the block's ports. An internal INPUT gate that backs a block
    // input port becomes a buffer driven from outside.
    def.inputPorts.forEach((p, i) => {
      const nodeId = prefix + p.internalGateId;
      const n = nodes.get(nodeId);
      if (!n) return;
      n.type = 'BUFFER';
      n.inputs = [null];
      inMap.set(portKey(instanceId, i), [{ node: nodeId, port: 0 }]);
    });

    def.outputPorts.forEach((p, j) => {
      const nodeId = prefix + p.internalGateId;
      if (!nodes.has(nodeId)) return;
      // OUTPUT nodes are pass-throughs, so port 0 carries the value
      outMap.set(portKey(instanceId, j), { node: nodeId, port: 0 });
    });
  };

  // --- top level ---
  for (const gate of circuit.gates) {
    const def = gate.blockId ? blockById.get(gate.blockId) : undefined;

    if (def) {
      expandBlock(gate.id, def, `${gate.id}/`, 0);
      continue;
    }

    const n = makeNode(
      gate.id,
      gate.type,
      nodeInputCount(gate.type, gate),
      gate.id,
      gate.memory ? { ...gate.memory } : {},
    );
    if (gate.type === 'INPUT') n.out[0] = gate.outputState;
    if (gate.type === 'CLOCK') n.out[0] = gate.memory?.q ?? gate.outputState;
    if (isEdgeTriggered(gate.type) || gate.type === 'SR_LATCH') {
      const q = gate.memory?.q ?? false;
      n.out = [q, !q];
    }
    nodes.set(gate.id, n);
    for (let i = 0; i < n.out.length; i++) outMap.set(portKey(gate.id, i), { node: gate.id, port: i });
    for (let i = 0; i < n.inputs.length; i++) inMap.set(portKey(gate.id, i), [{ node: gate.id, port: i }]);
  }

  for (const w of circuit.wires) {
    const src = outMap.get(portKey(w.fromGateId, w.fromPortIndex));
    const dsts = inMap.get(portKey(w.toGateId, w.toPortIndex));
    if (!src || !dsts) continue;
    for (const d of dsts) {
      const n = nodes.get(d.node);
      if (n) n.inputs[d.port] = src;
    }
  }

  return { nodes, order: topoOrder(nodes), outMap, inMap };
};

// ---------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------

/**
 * Kahn's algorithm in O(V + E). Nodes involved in feedback loops
 * cannot be ordered and are appended at the end; the settle loop
 * resolves them iteratively.
 */
export const topoOrder = (nodes: Map<string, Node>): string[] => {
  const indeg = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const id of nodes.keys()) {
    indeg.set(id, 0);
    dependents.set(id, []);
  }

  for (const node of nodes.values()) {
    for (const ref of node.inputs) {
      if (!ref || !nodes.has(ref.node)) continue;
      indeg.set(node.id, (indeg.get(node.id) ?? 0) + 1);
      dependents.get(ref.node)!.push(node.id);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of indeg) if (deg === 0) queue.push(id);

  const order: string[] = [];
  const seen = new Set<string>();
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    order.push(id);
    seen.add(id);
    for (const dep of dependents.get(id) ?? []) {
      const deg = (indeg.get(dep) ?? 1) - 1;
      indeg.set(dep, deg);
      if (deg === 0) queue.push(dep);
    }
  }

  for (const id of nodes.keys()) if (!seen.has(id)) order.push(id);
  return order;
};

/** True when the netlist contains at least one feedback loop */
export const hasFeedback = (netlist: Netlist): boolean =>
  netlist.order.length > 0 &&
  netlist.order.some((id, i) => {
    const node = netlist.nodes.get(id);
    if (!node) return false;
    return node.inputs.some((ref) => {
      if (!ref) return false;
      const j = netlist.order.indexOf(ref.node);
      return j > i;
    });
  });

// ---------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------

const readInputs = (netlist: Netlist, node: Node): boolean[] =>
  node.inputs.map((ref) => {
    if (!ref) return false;
    const src = netlist.nodes.get(ref.node);
    return src ? (src.out[ref.port] ?? false) : false;
  });

/**
 * Settle the combinational part of the network to a fixed point.
 * Edge-triggered elements and clocks hold their current outputs.
 * Returns false if the network never stopped changing.
 */
const settle = (netlist: Netlist): boolean => {
  let iterations = 0;
  let changed = true;

  while (changed && iterations < MAX_SETTLE_ITERATIONS) {
    changed = false;
    iterations++;

    for (const id of netlist.order) {
      const node = netlist.nodes.get(id);
      if (!node) continue;
      if (node.type === 'INPUT' || node.type === 'CLOCK') continue;
      if (isEdgeTriggered(node.type)) continue;

      const inputs = readInputs(netlist, node);
      const next = evaluatePrimitive(node.type, inputs, node);
      for (let i = 0; i < next.length; i++) {
        if (node.out[i] !== next[i]) {
          node.out[i] = next[i];
          changed = true;
        }
      }
    }
  }

  return !changed;
};

/** Advance free-running clocks by one tick */
const advanceClocks = (netlist: Netlist) => {
  for (const node of netlist.nodes.values()) {
    if (node.type !== 'CLOCK') continue;
    const period = Math.max(1, node.memory.period ?? DEFAULT_CLOCK_PERIOD);
    const phase = (node.memory.phase ?? 0) + 1;
    if (phase >= period) {
      node.memory.phase = 0;
      node.out[0] = !node.out[0];
      node.memory.q = node.out[0];
    } else {
      node.memory.phase = phase;
    }
  }
};

/**
 * Apply every edge-triggered element once, using the inputs as they
 * stand after settling. All flip-flops sample simultaneously, so a
 * shift register shifts by exactly one stage per edge.
 */
const applyEdges = (netlist: Netlist) => {
  const pending: { node: Node; q: boolean; clk: boolean }[] = [];

  for (const node of netlist.nodes.values()) {
    if (!isEdgeTriggered(node.type)) continue;
    const inputs = readInputs(netlist, node);
    const d = inputs[0] ?? false;
    const clk = inputs[1] ?? false;
    const lastClk = node.memory.lastClk ?? false;
    const rising = clk && !lastClk;
    const held = node.memory.q ?? false;

    let q = held;
    if (rising) q = node.type === 'D_FLIPFLOP' ? d : d ? !held : held;
    pending.push({ node, q, clk });
  }

  for (const { node, q, clk } of pending) {
    node.memory.q = q;
    node.memory.lastClk = clk;
    node.out[0] = q;
    node.out[1] = !q;
  }
};

export interface EvaluateOptions {
  /** Custom block definitions, so block instances can be expanded */
  blocks?: CustomBlockDefinition[];
  /** Persistent memory for sequential elements nested inside blocks */
  memoryStore?: MemoryStore;
  /** Advance free-running clocks. False for plain re-evaluation. */
  advanceTick?: boolean;
}

export interface EvaluateResult {
  circuit: CircuitState;
  /** False when the network oscillated instead of settling */
  stable: boolean;
}

/**
 * Evaluate a circuit and return a new CircuitState with every gate
 * output and wire signal brought up to date.
 */
export const evaluateCircuit = (
  circuit: CircuitState,
  options: EvaluateOptions = {},
): EvaluateResult => {
  const { blocks = [], memoryStore = new Map(), advanceTick = false } = options;
  const netlist = buildNetlist(circuit, blocks, memoryStore);

  let stable = settle(netlist);
  if (advanceTick) advanceClocks(netlist);
  applyEdges(netlist);
  stable = settle(netlist) && stable;

  // --- write results back onto the circuit ---
  const gates: Gate[] = circuit.gates.map((gate) => {
    const outCount = gate.blockId
      ? countBlockOutputs(netlist, gate.id)
      : nodeOutputCount(gate.type);

    const outputStates: boolean[] = [];
    for (let i = 0; i < Math.max(1, outCount); i++) {
      const ref = netlist.outMap.get(portKey(gate.id, i));
      const src = ref ? netlist.nodes.get(ref.node) : undefined;
      outputStates.push(src ? (src.out[ref!.port] ?? false) : false);
    }

    const node = netlist.nodes.get(gate.id);
    const next: Gate = {
      ...gate,
      outputState: outputStates[0] ?? false,
      outputStates,
    };
    if (node && isSequential(gate.type)) next.memory = { ...node.memory };
    return next;
  });

  const wires = circuit.wires.map((wire) => {
    const ref = netlist.outMap.get(portKey(wire.fromGateId, wire.fromPortIndex));
    const src = ref ? netlist.nodes.get(ref.node) : undefined;
    const signal = src ? (src.out[ref!.port] ?? false) : false;
    return wire.signal === signal ? wire : { ...wire, signal };
  });

  return { circuit: { ...circuit, gates, wires }, stable };
};

/** How many output ports a block instance exposes, per the netlist */
const countBlockOutputs = (netlist: Netlist, gateId: string): number => {
  let n = 0;
  while (netlist.outMap.has(portKey(gateId, n))) n++;
  return n;
};

// ---------------------------------------------------------------
// Backwards-compatible helpers
// ---------------------------------------------------------------

/** One simulation step: evaluate and advance clocks by a tick */
export const simulationStep = (
  circuit: CircuitState,
  options: Omit<EvaluateOptions, 'advanceTick'> = {},
): CircuitState => evaluateCircuit(circuit, { ...options, advanceTick: true }).circuit;

/** Toggle an INPUT gate and re-evaluate so the change propagates at once */
export const toggleInputGate = (
  circuit: CircuitState,
  gateId: string,
  options: EvaluateOptions = {},
): CircuitState => {
  const gates = circuit.gates.map((g) =>
    g.id === gateId && g.type === 'INPUT' ? { ...g, outputState: !g.outputState } : g,
  );
  return evaluateCircuit({ ...circuit, gates }, options).circuit;
};

/** Clear all stored state: flip-flops, latches, clocks and wire signals */
export const resetCircuitState = (
  circuit: CircuitState,
  options: EvaluateOptions = {},
): CircuitState => {
  options.memoryStore?.clear();
  const gates = circuit.gates.map((g) =>
    isSequential(g.type)
      ? { ...g, memory: {}, outputState: false, outputStates: [false, true] }
      : g,
  );
  return evaluateCircuit({ ...circuit, gates }, options).circuit;
};
