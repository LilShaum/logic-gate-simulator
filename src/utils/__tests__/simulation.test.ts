import { describe, expect, it } from 'vitest';
import type { CustomBlockDefinition } from '@/types/circuit';
import {
  DEFAULT_CLOCK_PERIOD,
  evaluateCircuit,
  evaluatePrimitive,
  resetCircuitState,
  simulationStep,
  toggleInputGate,
} from '@/utils/simulation';
import { circuit, gate, outOf, wire } from './testHelpers';

describe('primitive truth tables', () => {
  it('AND is true only when every input is high', () => {
    expect(evaluatePrimitive('AND', [true, true])).toEqual([true]);
    expect(evaluatePrimitive('AND', [true, false])).toEqual([false]);
    expect(evaluatePrimitive('AND', [true, true, true])).toEqual([true]);
    expect(evaluatePrimitive('AND', [true, true, false])).toEqual([false]);
  });

  it('OR is true when any input is high', () => {
    expect(evaluatePrimitive('OR', [false, false])).toEqual([false]);
    expect(evaluatePrimitive('OR', [false, false, true])).toEqual([true]);
  });

  it('XOR is odd parity across any fan-in', () => {
    expect(evaluatePrimitive('XOR', [true, false])).toEqual([true]);
    expect(evaluatePrimitive('XOR', [true, true])).toEqual([false]);
    expect(evaluatePrimitive('XOR', [true, true, true])).toEqual([true]);
    expect(evaluatePrimitive('XOR', [true, true, true, true])).toEqual([false]);
  });

  it('NAND/NOR/XNOR invert their counterparts', () => {
    expect(evaluatePrimitive('NAND', [true, true])).toEqual([false]);
    expect(evaluatePrimitive('NOR', [false, false])).toEqual([true]);
    expect(evaluatePrimitive('XNOR', [true, true])).toEqual([true]);
  });

  it('an unconnected input reads low, not undefined', () => {
    expect(evaluatePrimitive('AND', [])).toEqual([false]);
    expect(evaluatePrimitive('NOT', [])).toEqual([true]);
  });
});

describe('combinational propagation', () => {
  it('propagates through a chain without needing repeated steps', () => {
    const a = gate('INPUT', { outputState: true });
    const b = gate('INPUT', { outputState: true });
    const and = gate('AND');
    const not = gate('NOT');
    const led = gate('OUTPUT');
    const c = circuit(
      [a, b, and, not, led],
      [wire(a, 0, and, 0), wire(b, 0, and, 1), wire(and, 0, not, 0), wire(not, 0, led, 0)],
    );

    const { circuit: out, stable } = evaluateCircuit(c);
    expect(stable).toBe(true);
    expect(outOf(out, and)).toBe(true);
    expect(outOf(out, not)).toBe(false);
    expect(outOf(out, led)).toBe(false);
  });

  it('supports gates with more than two inputs', () => {
    const ins = [true, true, false].map((v) => gate('INPUT', { outputState: v }));
    const and3 = gate('AND', { inputCount: 3 });
    const c = circuit(
      [...ins, and3],
      ins.map((g, i) => wire(g, 0, and3, i)),
    );
    expect(outOf(evaluateCircuit(c).circuit, and3)).toBe(false);

    const allHigh = circuit(
      [...ins.map((g) => ({ ...g, outputState: true })), and3],
      ins.map((g, i) => wire(g, 0, and3, i)),
    );
    expect(outOf(evaluateCircuit(allHigh).circuit, and3)).toBe(true);
  });

  it('marks wire signals so the canvas can colour them', () => {
    const a = gate('INPUT', { outputState: true });
    const led = gate('OUTPUT');
    const w = wire(a, 0, led, 0);
    const out = evaluateCircuit(circuit([a, led], [w])).circuit;
    expect(out.wires[0].signal).toBe(true);
  });

  it('toggling an input immediately updates downstream gates', () => {
    const a = gate('INPUT', { outputState: false });
    const not = gate('NOT');
    const c = circuit([a, not], [wire(a, 0, not, 0)]);
    const toggled = toggleInputGate(c, a.id);
    expect(outOf(toggled, a)).toBe(true);
    expect(outOf(toggled, not)).toBe(false);
  });
});

describe('feedback loops', () => {
  it('settles a NOR-based SR latch built from primitives', () => {
    const s = gate('INPUT', { outputState: true });
    const r = gate('INPUT', { outputState: false });
    const nor1 = gate('NOR');
    const nor2 = gate('NOR');
    const c = circuit(
      [s, r, nor1, nor2],
      [
        wire(r, 0, nor1, 0),
        wire(nor2, 0, nor1, 1),
        wire(nor1, 0, nor2, 0),
        wire(s, 0, nor2, 1),
      ],
    );
    const { circuit: out, stable } = evaluateCircuit(c);
    expect(stable).toBe(true);
    // S high, R low -> Q(nor2) low, Qbar(nor1) high in this wiring
    expect(outOf(out, nor2)).toBe(false);
    expect(outOf(out, nor1)).toBe(true);
  });

  it('reports instability for a ring oscillator instead of hanging', () => {
    const not = gate('NOT');
    const c = circuit([not], [wire(not, 0, not, 0)]);
    const { stable } = evaluateCircuit(c);
    expect(stable).toBe(false);
  });
});

describe('sequential elements', () => {
  it('a D flip-flop captures D on the rising clock edge only', () => {
    const d = gate('INPUT', { outputState: true });
    const clk = gate('INPUT', { outputState: false });
    const ff = gate('D_FLIPFLOP');
    const build = (dv: boolean, cv: boolean, memory = {}) =>
      circuit(
        [
          { ...d, outputState: dv },
          { ...clk, outputState: cv },
          { ...ff, memory },
        ],
        [wire(d, 0, ff, 0), wire(clk, 0, ff, 1)],
      );

    // Clock low: nothing captured
    let out = evaluateCircuit(build(true, false)).circuit;
    expect(outOf(out, ff)).toBe(false);

    // Rising edge captures D = 1
    const mem = out.gates.find((g) => g.id === ff.id)!.memory ?? {};
    out = evaluateCircuit(build(true, true, mem)).circuit;
    expect(outOf(out, ff)).toBe(true);
    expect(outOf(out, ff, 1)).toBe(false); // Q-bar

    // D drops while clock stays high: Q holds
    const mem2 = out.gates.find((g) => g.id === ff.id)!.memory ?? {};
    out = evaluateCircuit(build(false, true, mem2)).circuit;
    expect(outOf(out, ff)).toBe(true);
  });

  it('a T flip-flop toggles once per rising edge', () => {
    const t = gate('INPUT', { outputState: true });
    const clk = gate('INPUT', { outputState: false });
    const ff = gate('T_FLIPFLOP');
    let memory = {};
    const pulse = (cv: boolean) => {
      const c = circuit(
        [t, { ...clk, outputState: cv }, { ...ff, memory }],
        [wire(t, 0, ff, 0), wire(clk, 0, ff, 1)],
      );
      const out = evaluateCircuit(c).circuit;
      memory = out.gates.find((g) => g.id === ff.id)!.memory ?? {};
      return outOf(out, ff);
    };

    expect(pulse(false)).toBe(false);
    expect(pulse(true)).toBe(true); // first edge
    expect(pulse(false)).toBe(true); // falling edge holds
    expect(pulse(true)).toBe(false); // second edge toggles back
  });

  it('an SR latch holds its value when both inputs go low', () => {
    const s = gate('INPUT', { outputState: true });
    const r = gate('INPUT', { outputState: false });
    const latch = gate('SR_LATCH');
    const build = (sv: boolean, rv: boolean, memory = {}) =>
      circuit(
        [{ ...s, outputState: sv }, { ...r, outputState: rv }, { ...latch, memory }],
        [wire(s, 0, latch, 0), wire(r, 0, latch, 1)],
      );

    let out = evaluateCircuit(build(true, false)).circuit;
    expect(outOf(out, latch)).toBe(true);

    const mem = out.gates.find((g) => g.id === latch.id)!.memory ?? {};
    out = evaluateCircuit(build(false, false, mem)).circuit;
    expect(outOf(out, latch)).toBe(true); // held

    const mem2 = out.gates.find((g) => g.id === latch.id)!.memory ?? {};
    out = evaluateCircuit(build(false, true, mem2)).circuit;
    expect(outOf(out, latch)).toBe(false); // reset
  });

  it('a CLOCK toggles on its period and only while stepping', () => {
    const clk = gate('CLOCK');
    let c = circuit([clk], []);

    // Plain evaluation must not advance the clock
    c = evaluateCircuit(c).circuit;
    expect(outOf(c, clk)).toBe(false);

    for (let i = 0; i < DEFAULT_CLOCK_PERIOD; i++) c = simulationStep(c);
    expect(outOf(c, clk)).toBe(true);

    for (let i = 0; i < DEFAULT_CLOCK_PERIOD; i++) c = simulationStep(c);
    expect(outOf(c, clk)).toBe(false);
  });

  it('reset clears stored flip-flop state', () => {
    const ff = gate('D_FLIPFLOP', { memory: { q: true, lastClk: true } });
    const out = resetCircuitState(circuit([ff], []));
    expect(outOf(out, ff)).toBe(false);
  });
});

describe('custom blocks', () => {
  // A half-adder block: two inputs, two outputs (sum via XOR, carry via AND)
  const makeHalfAdder = (): CustomBlockDefinition => {
    const inA = gate('INPUT');
    const inB = gate('INPUT');
    const xor = gate('XOR');
    const and = gate('AND');
    const sum = gate('OUTPUT');
    const carry = gate('OUTPUT');
    return {
      id: 'blk-halfadder',
      name: 'Half Adder',
      description: '',
      icon: 'HA',
      internalGates: [inA, inB, xor, and, sum, carry],
      internalWires: [
        wire(inA, 0, xor, 0),
        wire(inB, 0, xor, 1),
        wire(inA, 0, and, 0),
        wire(inB, 0, and, 1),
        wire(xor, 0, sum, 0),
        wire(and, 0, carry, 0),
      ],
      inputPorts: [
        { internalGateId: inA.id, portIndex: 0, name: 'A' },
        { internalGateId: inB.id, portIndex: 0, name: 'B' },
      ],
      outputPorts: [
        { internalGateId: sum.id, portIndex: 0, name: 'S' },
        { internalGateId: carry.id, portIndex: 0, name: 'C' },
      ],
      timestamp: 0,
    };
  };

  const runHalfAdder = (a: boolean, b: boolean) => {
    const block = makeHalfAdder();
    const inA = gate('INPUT', { outputState: a });
    const inB = gate('INPUT', { outputState: b });
    const inst = gate('BLOCK', { blockId: block.id });
    const sumLed = gate('OUTPUT');
    const carryLed = gate('OUTPUT');
    const c = circuit(
      [inA, inB, inst, sumLed, carryLed],
      [
        wire(inA, 0, inst, 0),
        wire(inB, 0, inst, 1),
        wire(inst, 0, sumLed, 0),
        wire(inst, 1, carryLed, 0),
      ],
    );
    const out = evaluateCircuit(c, { blocks: [block] }).circuit;
    return { sum: outOf(out, sumLed), carry: outOf(out, carryLed) };
  };

  it('evaluates a block instance instead of returning false', () => {
    expect(runHalfAdder(false, false)).toEqual({ sum: false, carry: false });
    expect(runHalfAdder(true, false)).toEqual({ sum: true, carry: false });
    expect(runHalfAdder(false, true)).toEqual({ sum: true, carry: false });
    expect(runHalfAdder(true, true)).toEqual({ sum: false, carry: true });
  });

  it('evaluates blocks nested inside other blocks', () => {
    const half = makeHalfAdder();
    // A wrapper block that contains one half adder and exposes its sum
    const inA = gate('INPUT');
    const inB = gate('INPUT');
    const inner = gate('BLOCK', { blockId: half.id });
    const out = gate('OUTPUT');
    const wrapper: CustomBlockDefinition = {
      id: 'blk-wrapper',
      name: 'Wrapper',
      description: '',
      icon: 'W',
      internalGates: [inA, inB, inner, out],
      internalWires: [wire(inA, 0, inner, 0), wire(inB, 0, inner, 1), wire(inner, 0, out, 0)],
      inputPorts: [
        { internalGateId: inA.id, portIndex: 0, name: 'A' },
        { internalGateId: inB.id, portIndex: 0, name: 'B' },
      ],
      outputPorts: [{ internalGateId: out.id, portIndex: 0, name: 'S' }],
      timestamp: 0,
    };

    const a = gate('INPUT', { outputState: true });
    const b = gate('INPUT', { outputState: false });
    const inst = gate('BLOCK', { blockId: wrapper.id });
    const led = gate('OUTPUT');
    const c = circuit(
      [a, b, inst, led],
      [wire(a, 0, inst, 0), wire(b, 0, inst, 1), wire(inst, 0, led, 0)],
    );
    const result = evaluateCircuit(c, { blocks: [half, wrapper] }).circuit;
    expect(outOf(result, led)).toBe(true); // 1 XOR 0 = 1
  });

  it('does not hang on a block that references itself', () => {
    const inA = gate('INPUT');
    const self = gate('BLOCK', { blockId: 'blk-recursive' });
    const out = gate('OUTPUT');
    const recursive: CustomBlockDefinition = {
      id: 'blk-recursive',
      name: 'Recursive',
      description: '',
      icon: 'R',
      internalGates: [inA, self, out],
      internalWires: [wire(inA, 0, self, 0), wire(self, 0, out, 0)],
      inputPorts: [{ internalGateId: inA.id, portIndex: 0, name: 'A' }],
      outputPorts: [{ internalGateId: out.id, portIndex: 0, name: 'Q' }],
      timestamp: 0,
    };
    const inst = gate('BLOCK', { blockId: recursive.id });
    const c = circuit([inst], []);
    expect(() => evaluateCircuit(c, { blocks: [recursive] })).not.toThrow();
  });
});
