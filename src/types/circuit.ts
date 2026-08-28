// ============================================================
// Logic Gate Simulator - Core Type Definitions
// ============================================================

/** Unique identifier for circuit elements */
export type ElementId = string;

/** 2D coordinate */
export interface Position {
  x: number;
  y: number;
}

/** Bounding box for elements */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ------------------------------------------------------------
// Port Types
// ------------------------------------------------------------

/** Whether a port is an input or output */
export type PortDirection = 'input' | 'output';

/** A port on a gate where wires connect */
export interface Port {
  id: ElementId;
  name: string;
  direction: PortDirection;
  /** Position relative to the gate's top-left corner */
  offset: Position;
}

// ------------------------------------------------------------
// Gate Types
// ------------------------------------------------------------

/**
 * Supported primitive types.
 *
 * Combinational: AND OR NOT NAND NOR XOR XNOR BUFFER
 * Sources/sinks: INPUT OUTPUT CONSTANT_HIGH CONSTANT_LOW CLOCK
 * Sequential:    D_FLIPFLOP T_FLIPFLOP SR_LATCH
 * Composite:     BLOCK (an instance of a user-defined block)
 */
export type GateType =
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'NAND'
  | 'NOR'
  | 'XOR'
  | 'XNOR'
  | 'BUFFER'
  | 'INPUT'
  | 'OUTPUT'
  | 'CONSTANT_HIGH'
  | 'CONSTANT_LOW'
  | 'CLOCK'
  | 'D_FLIPFLOP'
  | 'T_FLIPFLOP'
  | 'SR_LATCH'
  | 'BLOCK';

/** Gate types whose input count the user can change (2..MAX_FAN_IN) */
export const VARIABLE_ARITY_TYPES: GateType[] = [
  'AND',
  'OR',
  'NAND',
  'NOR',
  'XOR',
  'XNOR',
];

/** Gate types that hold state between ticks */
export const SEQUENTIAL_TYPES: GateType[] = [
  'CLOCK',
  'D_FLIPFLOP',
  'T_FLIPFLOP',
  'SR_LATCH',
];

export const MIN_FAN_IN = 2;
export const MAX_FAN_IN = 8;

/** Configuration for a gate type at a given arity (port layout, size, label) */
export interface GateConfig {
  type: GateType;
  label: string;
  width: number;
  height: number;
  inputs: Port[];
  outputs: Port[];
}

/**
 * Memory carried by sequential primitives between simulation ticks.
 * Keys are primitive-specific; absent keys read as `false`.
 */
export interface GateMemory {
  /** Previous clock-input level, for edge detection */
  lastClk?: boolean;
  /** Stored Q value */
  q?: boolean;
  /** Free-running CLOCK: ticks elapsed since the last toggle */
  phase?: number;
  /** Free-running CLOCK: ticks per level (half-period) */
  period?: number;
}

/** A placed gate instance in the circuit */
export interface Gate {
  id: ElementId;
  type: GateType;
  position: Position;
  /** Current output state. For multi-output gates, index 0 of `outputStates`. */
  outputState: boolean;
  /** Per-port output states. Single-output gates use `[outputState]`. */
  outputStates?: boolean[];
  /** Fan-in for variable-arity gates. Defaults to the type's natural arity. */
  inputCount?: number;
  /** User-facing name, shown on INPUT/OUTPUT pins */
  label?: string;
  /** Sequential state; only present on sequential primitives */
  memory?: GateMemory;
  /** Period in ticks for CLOCK primitives (half-period per level) */
  clockPeriod?: number;
  /** If set, this gate is an instance of a custom block */
  blockId?: ElementId;
}

// ------------------------------------------------------------
// Wire Types
// ------------------------------------------------------------

/** A wire connecting an output port to an input port */
export interface Wire {
  id: ElementId;
  fromGateId: ElementId;
  fromPortIndex: number;
  toGateId: ElementId;
  toPortIndex: number;
  /** Whether the wire is currently carrying a high signal */
  signal: boolean;
  /** Optional waypoints for routing (between start and end) */
  waypoints: Position[];
}

// ------------------------------------------------------------
// Circuit State
// ------------------------------------------------------------

/** The entire circuit state */
export interface CircuitState {
  gates: Gate[];
  wires: Wire[];
  /** Which element is currently selected (gate or wire) — single-select fallback */
  selectedElementId: ElementId | null;
  /** IDs of all currently selected gates (multi-select) */
  selectedGateIds: ElementId[];
}

// ------------------------------------------------------------
// Simulation Types
// ------------------------------------------------------------

/** Speed presets for the free-running clock */
export type SimulationSpeed = 'slow' | 'normal' | 'fast';

/** The simulation run mode */
export type SimulationMode = 'stopped' | 'running' | 'paused';

/** Full simulation state managed by the useSimulation hook */
export interface SimulationState {
  mode: SimulationMode;
  speed: SimulationSpeed;
  /** Incrementing tick counter — bumped each step */
  tick: number;
  /** Set when the last evaluation failed to reach a stable state */
  oscillating: boolean;
}

/** Milliseconds between ticks for each speed preset */
export const SPEED_INTERVALS: Record<SimulationSpeed, number> = {
  slow: 500,
  normal: 200,
  fast: 50,
};

// ------------------------------------------------------------
// Canvas / Editor Types
// ------------------------------------------------------------

/** Pan and zoom state for the canvas viewport */
export interface Viewport {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

/** Available tools for the editor */
export type Tool = 'select' | 'wire' | 'delete' | 'pan';

/** The editor application state */
export interface EditorState {
  circuit: CircuitState;
  viewport: Viewport;
  activeTool: Tool;
  pendingGateType: GateType | null;
}

// ------------------------------------------------------------
// Canvas Rendering Types
// ------------------------------------------------------------

/** Options for drawing a gate on the canvas */
export interface DrawGateOptions {
  gate: Gate;
  config: GateConfig;
  selected: boolean;
  hovered: boolean;
}

/** Options for drawing a wire on the canvas */
export interface DrawWireOptions {
  wire: Wire;
  selected: boolean;
  hovered: boolean;
}

// ------------------------------------------------------------
// Custom Block Types
// ------------------------------------------------------------

/** A port mapping connects a block-level port to an internal gate port */
export interface BlockPortMapping {
  /** Internal gate ID within the block definition */
  internalGateId: ElementId;
  /** Port index on the internal gate */
  portIndex: number;
  /** User-facing name for this port */
  name: string;
}

/** The complete definition of a custom block */
export interface CustomBlockDefinition {
  id: ElementId;
  name: string;
  description: string;
  icon: string;
  /** Gates inside this block (positions are relative to block origin) */
  internalGates: Gate[];
  /** Wires inside this block (using internal gate IDs) */
  internalWires: Wire[];
  /** Block-level input ports mapped to internal INPUT gates */
  inputPorts: BlockPortMapping[];
  /** Block-level output ports mapped to internal OUTPUT gates */
  outputPorts: BlockPortMapping[];
  /** Timestamp of last modification */
  timestamp: number;
}

/** Editor state for block editing mode */
export interface BlockEditorState {
  editingBlockId: ElementId | null;
  editingCircuit: CircuitState | null;
}
