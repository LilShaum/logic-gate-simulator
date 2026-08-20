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
  /** Relative position from the gate's top-left */
  offset: Position;
}

// ------------------------------------------------------------
// Gate Types
// ------------------------------------------------------------

/** Supported logic gate types */
export type GateType =
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'NAND'
  | 'NOR'
  | 'XOR'
  | 'XNOR'
  | 'INPUT'
  | 'OUTPUT'
  | 'CONSTANT_HIGH'
  | 'CONSTANT_LOW';

/** Configuration for each gate type (port layout, size, etc.) */
export interface GateConfig {
  type: GateType;
  label: string;
  width: number;
  height: number;
  inputs: Port[];
  outputs: Port[];
}

/** A placed gate instance in the circuit */
export interface Gate {
  id: ElementId;
  type: GateType;
  position: Position;
  /** Current output state(s) — computed from inputs */
  outputState: boolean;
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

/** Speed presets for auto-step simulation */
export type SimulationSpeed = 'slow' | 'normal' | 'fast';

/** The simulation run mode */
export type SimulationMode = 'stopped' | 'running' | 'paused';

/** Full simulation state managed by the useSimulation hook */
export interface SimulationState {
  mode: SimulationMode;
  speed: SimulationSpeed;
  /** Incrementing tick counter — bumped each step */
  tick: number;
}

/** Ticks-per-second for each speed preset */
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
export type Tool =
  | 'select'
  | 'wire'
  | 'delete'
  | 'pan';

/** The editor application state */
export interface EditorState {
  circuit: CircuitState;
  viewport: Viewport;
  activeTool: Tool;
  /** Gate type to place next (only relevant when a gate palette is open) */
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
  /** ID of the block being edited, or null */
  editingBlockId: ElementId | null;
  /** The block's internal circuit during edit mode */
  editingCircuit: CircuitState | null;
}
