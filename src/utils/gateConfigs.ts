// ============================================================
// Gate geometry — the single source of truth for how big a gate
// is and where its ports sit.
//
// Everything that draws, hit-tests or routes wires reads from
// here, so a shape and its ports can never drift apart.
// ============================================================

import type {
  CustomBlockDefinition,
  ElementId,
  Gate,
  GateConfig,
  GateType,
  Port,
} from '@/types/circuit';
import { MAX_FAN_IN, MIN_FAN_IN, VARIABLE_ARITY_TYPES } from '@/types/circuit';

/**
 * Length of the pin stub between a port and the gate body.
 * Shapes are drawn inside [LEAD, width - LEAD]; the leads are the
 * short lines that connect the body out to the port positions.
 */
export const LEAD = 12;

/** Radius of an inversion bubble (NOT/NAND/NOR/XNOR) */
export const BUBBLE_R = 5;

/**
 * Vertical spacing allotted to each pin. Heights are chosen as
 * (pins + 1) * PIN_PITCH so that `spread` lands every port on a whole
 * multiple of the pitch — which is also the canvas snap increment, so
 * gates dropped on the grid line up without nudging.
 */
const PIN_PITCH = 20;

/** Base dimensions for a standard two-input logic gate */
const STD_WIDTH = 80;

/** Height of an I/O pin, chosen so its single port sits on the grid */
const IO_HEIGHT = 40;

/** Height of a flip-flop, leaving room for a title above two pin rows */
const FF_HEIGHT = 72;

/**
 * Distribute `count` ports evenly down an element of `height`,
 * leaving a margin at top and bottom. This is the fix for the
 * long-standing bug where port Y was derived from *width*.
 */
const spread = (count: number, height: number, index: number): number =>
  (height * (index + 1)) / (count + 1);

const makePorts = (
  names: string[],
  direction: 'input' | 'output',
  width: number,
  height: number,
): Port[] =>
  names.map((name, i) => ({
    id: `${direction}-${i}`,
    name,
    direction,
    offset: {
      x: direction === 'input' ? 0 : width,
      y: spread(names.length, height, i),
    },
  }));

/** A, B, C, ... labels for a variable-arity gate */
const alphaNames = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));

/** Clamp a requested fan-in into the supported range */
export const clampFanIn = (type: GateType, requested: number | undefined): number => {
  if (!VARIABLE_ARITY_TYPES.includes(type)) return naturalArity(type);
  const n = requested ?? 2;
  return Math.min(MAX_FAN_IN, Math.max(MIN_FAN_IN, Math.round(n)));
};

/** The fan-in a type has when the user has not customised it */
export const naturalArity = (type: GateType): number => {
  switch (type) {
    case 'NOT':
    case 'BUFFER':
    case 'OUTPUT':
      return 1;
    case 'AND':
    case 'OR':
    case 'NAND':
    case 'NOR':
    case 'XOR':
    case 'XNOR':
    case 'D_FLIPFLOP':
    case 'T_FLIPFLOP':
    case 'SR_LATCH':
      return 2;
    default:
      return 0;
  }
};

/** Height of a standard gate at a given fan-in */
const stdHeight = (inputCount: number): number => (inputCount + 1) * PIN_PITCH;

// ---------------------------------------------------------------
// Config construction
// ---------------------------------------------------------------

const buildConfig = (type: GateType, inputCount: number): GateConfig => {
  switch (type) {
    case 'INPUT': {
      const width = 62;
      const height = IO_HEIGHT;
      return {
        type,
        label: 'IN',
        width,
        height,
        inputs: [],
        outputs: makePorts(['Q'], 'output', width, height),
      };
    }

    case 'OUTPUT': {
      const width = 52;
      const height = IO_HEIGHT;
      return {
        type,
        label: 'OUT',
        width,
        height,
        inputs: makePorts(['D'], 'input', width, height),
        outputs: [],
      };
    }

    case 'CONSTANT_HIGH':
    case 'CONSTANT_LOW': {
      const width = 44;
      const height = IO_HEIGHT;
      return {
        type,
        label: type === 'CONSTANT_HIGH' ? '1' : '0',
        width,
        height,
        inputs: [],
        outputs: makePorts(['Q'], 'output', width, height),
      };
    }

    case 'CLOCK': {
      const width = 58;
      const height = IO_HEIGHT;
      return {
        type,
        label: 'CLK',
        width,
        height,
        inputs: [],
        outputs: makePorts(['Q'], 'output', width, height),
      };
    }

    case 'NOT':
    case 'BUFFER': {
      const width = 68;
      const height = IO_HEIGHT;
      return {
        type,
        label: type,
        width,
        height,
        inputs: makePorts(['A'], 'input', width, height),
        outputs: makePorts(['Q'], 'output', width, height),
      };
    }

    case 'D_FLIPFLOP': {
      const width = 84;
      const height = FF_HEIGHT;
      return {
        type,
        label: 'D-FF',
        width,
        height,
        inputs: makePorts(['D', 'CLK'], 'input', width, height),
        outputs: makePorts(['Q', 'Q̅'], 'output', width, height),
      };
    }

    case 'T_FLIPFLOP': {
      const width = 84;
      const height = FF_HEIGHT;
      return {
        type,
        label: 'T-FF',
        width,
        height,
        inputs: makePorts(['T', 'CLK'], 'input', width, height),
        outputs: makePorts(['Q', 'Q̅'], 'output', width, height),
      };
    }

    case 'SR_LATCH': {
      const width = 84;
      const height = FF_HEIGHT;
      return {
        type,
        label: 'SR',
        width,
        height,
        inputs: makePorts(['S', 'R'], 'input', width, height),
        outputs: makePorts(['Q', 'Q̅'], 'output', width, height),
      };
    }

    case 'BLOCK': {
      // Placeholder; real block configs come from getBlockGateConfig()
      const width = 90;
      const height = 56;
      return {
        type,
        label: 'BLOCK',
        width,
        height,
        inputs: [],
        outputs: [],
      };
    }

    default: {
      // AND / OR / NAND / NOR / XOR / XNOR
      const height = stdHeight(inputCount);
      return {
        type,
        label: type,
        width: STD_WIDTH,
        height,
        inputs: makePorts(alphaNames(inputCount), 'input', STD_WIDTH, height),
        outputs: makePorts(['Q'], 'output', STD_WIDTH, height),
      };
    }
  }
};

// Configs are read every frame for every gate; memoise them.
const configCache = new Map<string, GateConfig>();

/**
 * Get the geometry for a gate type at a given fan-in.
 * `inputCount` is ignored for fixed-arity types.
 */
export const getGateConfig = (type: GateType, inputCount?: number): GateConfig => {
  const n = clampFanIn(type, inputCount);
  const key = `${type}:${n}`;
  let cfg = configCache.get(key);
  if (!cfg) {
    cfg = buildConfig(type, n);
    configCache.set(key, cfg);
  }
  return cfg;
};

// ---------------------------------------------------------------
// Custom block geometry
// ---------------------------------------------------------------

const BLOCK_MIN_WIDTH = 92;

/**
 * Geometry for an instance of a custom block. Sized from its port
 * count and its name so the label always fits.
 */
export const getBlockGateConfig = (def: CustomBlockDefinition): GateConfig => {
  const inputCount = def.inputPorts.length;
  const outputCount = def.outputPorts.length;
  const height = (Math.max(inputCount, outputCount, 2) + 1) * PIN_PITCH;
  const width = Math.max(BLOCK_MIN_WIDTH, def.name.length * 8 + 2 * LEAD + 24);

  return {
    type: 'BLOCK',
    label: def.name,
    width,
    height,
    inputs: makePorts(
      def.inputPorts.map((p) => p.name),
      'input',
      width,
      height,
    ),
    outputs: makePorts(
      def.outputPorts.map((p) => p.name),
      'output',
      width,
      height,
    ),
  };
};

/**
 * Block definitions are registered once per render so that *any*
 * module — wire routing, hit testing, alignment — can resolve a
 * block instance's geometry without threading the library through.
 */
const blockRegistry = new Map<ElementId, CustomBlockDefinition>();

export const registerBlocks = (blocks: CustomBlockDefinition[]): void => {
  blockRegistry.clear();
  for (const b of blocks) blockRegistry.set(b.id, b);
};

export const getRegisteredBlock = (id: ElementId): CustomBlockDefinition | undefined =>
  blockRegistry.get(id);

/**
 * Geometry for a specific placed gate: honours a custom fan-in and
 * resolves custom block instances against the registry.
 */
export const getConfigForGate = (gate: Gate): GateConfig => {
  if (gate.blockId) {
    const def = blockRegistry.get(gate.blockId);
    if (def) return getBlockGateConfig(def);
  }
  return getGateConfig(gate.type, gate.inputCount);
};

/** Whether the user may add/remove inputs on this gate */
export const supportsVariableArity = (type: GateType): boolean =>
  VARIABLE_ARITY_TYPES.includes(type);

// ---------------------------------------------------------------
// Palette metadata
// ---------------------------------------------------------------

/** All placeable primitive types, in palette order */
export const ALL_GATE_TYPES: GateType[] = [
  'INPUT',
  'OUTPUT',
  'CONSTANT_HIGH',
  'CONSTANT_LOW',
  'CLOCK',
  'AND',
  'OR',
  'NOT',
  'BUFFER',
  'NAND',
  'NOR',
  'XOR',
  'XNOR',
  'D_FLIPFLOP',
  'T_FLIPFLOP',
  'SR_LATCH',
];

/** Human-readable one-liners, used by the palette and tooltips */
export const GATE_DESCRIPTIONS: Record<GateType, string> = {
  INPUT: 'Toggle switch — click it on the canvas to flip between 0 and 1',
  OUTPUT: 'LED probe — lights up when its input is high',
  CONSTANT_HIGH: 'Constant 1 — always outputs high',
  CONSTANT_LOW: 'Constant 0 — always outputs low',
  CLOCK: 'Free-running clock — toggles every N ticks while the sim runs',
  AND: 'Output is 1 only when every input is 1',
  OR: 'Output is 1 when at least one input is 1',
  NOT: 'Inverter — output is the opposite of the input',
  BUFFER: 'Buffer — passes the input straight through',
  NAND: 'Inverted AND — output is 0 only when every input is 1',
  NOR: 'Inverted OR — output is 1 only when every input is 0',
  XOR: 'Output is 1 when an odd number of inputs are 1',
  XNOR: 'Output is 1 when an even number of inputs are 1',
  D_FLIPFLOP: 'Stores D on each rising clock edge. Outputs Q and its inverse.',
  T_FLIPFLOP: 'Toggles Q on each rising clock edge while T is high',
  SR_LATCH: 'Set/Reset latch — S sets Q, R clears it, both low holds',
  BLOCK: 'An instance of a block you built',
};

/** Compact glyphs used by the palette list */
export const GATE_ICONS: Record<GateType, string> = {
  INPUT: '⊙',
  OUTPUT: '◉',
  CONSTANT_HIGH: '1',
  CONSTANT_LOW: '0',
  CLOCK: '⎍',
  AND: '&',
  OR: '≥1',
  NOT: '¬',
  BUFFER: '▷',
  NAND: '&̄',
  NOR: '≥1̄',
  XOR: '=1',
  XNOR: '=1̄',
  D_FLIPFLOP: 'D',
  T_FLIPFLOP: 'T',
  SR_LATCH: 'SR',
  BLOCK: '▣',
};

/** Palette grouping */
export interface GateCategory {
  id: string;
  label: string;
  icon: string;
  gates: GateType[];
}

export const GATE_CATEGORIES: GateCategory[] = [
  { id: 'io', label: 'I/O', icon: '⊙', gates: ['INPUT', 'OUTPUT', 'CONSTANT_HIGH', 'CONSTANT_LOW', 'CLOCK'] },
  { id: 'basic', label: 'Basic', icon: '&', gates: ['AND', 'OR', 'NOT', 'BUFFER'] },
  { id: 'advanced', label: 'Advanced', icon: '=1', gates: ['NAND', 'NOR', 'XOR', 'XNOR'] },
  { id: 'memory', label: 'Memory', icon: 'D', gates: ['D_FLIPFLOP', 'T_FLIPFLOP', 'SR_LATCH'] },
];
