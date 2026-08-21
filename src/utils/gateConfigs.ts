import type {
  GateConfig,
  GateType,
  Port,
} from '@/types/circuit';

// ---------------------------------------------------------------
// Gate definitions — port layout, size, default labels
// ---------------------------------------------------------------

const makeInputPorts = (count: number, width: number): Port[] =>
  Array.from({ length: count }, (_, i) => ({
    id: '', // assigned at creation time
    name: String.fromCharCode(65 + i), // A, B, C, ...
    direction: 'input',
    offset: {
      x: 0,
      y: ((i + 1) / (count + 1)) * width * 0.6,
    },
  }));

const makeOutputPorts = (count: number, width: number): Port[] =>
  Array.from({ length: count }, (_, i) => ({
    id: '',
    name: count === 1 ? 'OUT' : `OUT${i + 1}`,
    direction: 'output',
    offset: {
      x: width,
      y: ((i + 1) / (count + 1)) * width * 0.6,
    },
  }));

const GATE_WIDTH = 80;
const GATE_HEIGHT = 60;

const gateConfigs: Record<GateType, GateConfig> = {
  INPUT: {
    type: 'INPUT',
    label: 'IN',
    width: GATE_WIDTH * 0.75,
    height: GATE_HEIGHT * 0.75,
    inputs: [],
    outputs: makeOutputPorts(1, GATE_WIDTH * 0.75),
  },
  OUTPUT: {
    type: 'OUTPUT',
    label: 'OUT',
    width: GATE_WIDTH * 0.75,
    height: GATE_HEIGHT * 0.75,
    inputs: makeInputPorts(1, GATE_WIDTH * 0.75),
    outputs: [],
  },
  NOT: {
    type: 'NOT',
    label: 'NOT',
    width: GATE_WIDTH,
    height: GATE_HEIGHT,
    inputs: makeInputPorts(1, GATE_WIDTH),
    outputs: makeOutputPorts(1, GATE_WIDTH),
  },
  AND: {
    type: 'AND',
    label: 'AND',
    width: GATE_WIDTH,
    height: GATE_HEIGHT,
    inputs: makeInputPorts(2, GATE_WIDTH),
    outputs: makeOutputPorts(1, GATE_WIDTH),
  },
  OR: {
    type: 'OR',
    label: 'OR',
    width: GATE_WIDTH,
    height: GATE_HEIGHT,
    inputs: makeInputPorts(2, GATE_WIDTH),
    outputs: makeOutputPorts(1, GATE_WIDTH),
  },
  NAND: {
    type: 'NAND',
    label: 'NAND',
    width: GATE_WIDTH,
    height: GATE_HEIGHT,
    inputs: makeInputPorts(2, GATE_WIDTH),
    outputs: makeOutputPorts(1, GATE_WIDTH),
  },
  NOR: {
    type: 'NOR',
    label: 'NOR',
    width: GATE_WIDTH,
    height: GATE_HEIGHT,
    inputs: makeInputPorts(2, GATE_WIDTH),
    outputs: makeOutputPorts(1, GATE_WIDTH),
  },
  XOR: {
    type: 'XOR',
    label: 'XOR',
    width: GATE_WIDTH,
    height: GATE_HEIGHT,
    inputs: makeInputPorts(2, GATE_WIDTH),
    outputs: makeOutputPorts(1, GATE_WIDTH),
  },
  XNOR: {
    type: 'XNOR',
    label: 'XNOR',
    width: GATE_WIDTH,
    height: GATE_HEIGHT,
    inputs: makeInputPorts(2, GATE_WIDTH),
    outputs: makeOutputPorts(1, GATE_WIDTH),
  },
  CONSTANT_HIGH: {
    type: 'CONSTANT_HIGH',
    label: '1',
    width: GATE_WIDTH * 0.75,
    height: GATE_HEIGHT * 0.75,
    inputs: [],
    outputs: makeOutputPorts(1, GATE_WIDTH * 0.75),
  },
  CONSTANT_LOW: {
    type: 'CONSTANT_LOW',
    label: '0',
    width: GATE_WIDTH * 0.75,
    height: GATE_HEIGHT * 0.75,
    inputs: [],
    outputs: makeOutputPorts(1, GATE_WIDTH * 0.75),
  },
};

/** Get the static config for a gate type */
export const getGateConfig = (type: GateType): GateConfig =>
  gateConfigs[type];

/** All available gate types (for palette / menus) */
export const ALL_GATE_TYPES: GateType[] = [
  'INPUT',
  'OUTPUT',
  'CONSTANT_HIGH',
  'CONSTANT_LOW',
  'NOT',
  'AND',
  'OR',
  'NAND',
  'NOR',
  'XOR',
  'XNOR',
];
