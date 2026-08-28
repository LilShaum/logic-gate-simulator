import { describe, expect, it } from 'vitest';
import { MAX_TRUTH_TABLE_INPUTS, buildTruthTable, sumOfProducts } from '@/utils/truthTable';
import { circuit, gate, wire } from './testHelpers';

describe('buildTruthTable', () => {
  it('enumerates a two-input AND in conventional counting order', () => {
    const a = gate('INPUT', { position: { x: 0, y: 0 }, label: 'A' });
    const b = gate('INPUT', { position: { x: 0, y: 50 }, label: 'B' });
    const and = gate('AND', { position: { x: 100, y: 0 } });
    const led = gate('OUTPUT', { position: { x: 200, y: 0 }, label: 'Y' });
    const table = buildTruthTable(
      circuit([a, b, and, led], [wire(a, 0, and, 0), wire(b, 0, and, 1), wire(and, 0, led, 0)]),
    );

    expect(table.inputs.map((c) => c.label)).toEqual(['A', 'B']);
    expect(table.outputs.map((c) => c.label)).toEqual(['Y']);
    expect(table.rows.map((r) => r.inputs)).toEqual([
      [false, false],
      [false, true],
      [true, false],
      [true, true],
    ]);
    expect(table.rows.map((r) => r.outputs[0])).toEqual([false, false, false, true]);
  });

  it('handles multiple outputs (half adder)', () => {
    const a = gate('INPUT', { position: { x: 0, y: 0 } });
    const b = gate('INPUT', { position: { x: 0, y: 50 } });
    const xor = gate('XOR', { position: { x: 100, y: 0 } });
    const and = gate('AND', { position: { x: 100, y: 80 } });
    const sum = gate('OUTPUT', { position: { x: 200, y: 0 } });
    const carry = gate('OUTPUT', { position: { x: 200, y: 80 } });
    const table = buildTruthTable(
      circuit(
        [a, b, xor, and, sum, carry],
        [
          wire(a, 0, xor, 0),
          wire(b, 0, xor, 1),
          wire(a, 0, and, 0),
          wire(b, 0, and, 1),
          wire(xor, 0, sum, 0),
          wire(and, 0, carry, 0),
        ],
      ),
    );
    expect(table.rows.map((r) => r.outputs)).toEqual([
      [false, false],
      [true, false],
      [true, false],
      [false, true],
    ]);
  });

  it('does not mutate the circuit it is given', () => {
    const a = gate('INPUT', { outputState: false });
    const led = gate('OUTPUT');
    const c = circuit([a, led], [wire(a, 0, led, 0)]);
    const snapshot = JSON.stringify(c);
    buildTruthTable(c);
    expect(JSON.stringify(c)).toBe(snapshot);
  });

  it('returns an empty table when there is nothing to tabulate', () => {
    const table = buildTruthTable(circuit([gate('AND')], []));
    expect(table.rows).toEqual([]);
  });

  it('flags sequential circuits and caps very wide ones', () => {
    const ff = gate('D_FLIPFLOP', { position: { x: 100, y: 0 } });
    const ins = Array.from({ length: MAX_TRUTH_TABLE_INPUTS + 2 }, (_, i) =>
      gate('INPUT', { position: { x: 0, y: i * 40 } }),
    );
    const led = gate('OUTPUT', { position: { x: 200, y: 0 } });
    const table = buildTruthTable(
      circuit([...ins, ff, led], [wire(ins[0], 0, ff, 0), wire(ff, 0, led, 0)]),
    );
    expect(table.sequential).toBe(true);
    expect(table.truncated).toBe(true);
    expect(table.inputs).toHaveLength(MAX_TRUTH_TABLE_INPUTS);
    expect(table.rows).toHaveLength(2 ** MAX_TRUTH_TABLE_INPUTS);
  });
});

describe('sumOfProducts', () => {
  it('reads minterms off the table', () => {
    const a = gate('INPUT', { position: { x: 0, y: 0 }, label: 'A' });
    const b = gate('INPUT', { position: { x: 0, y: 50 }, label: 'B' });
    const xor = gate('XOR', { position: { x: 100, y: 0 } });
    const led = gate('OUTPUT', { position: { x: 200, y: 0 }, label: 'Y' });
    const table = buildTruthTable(
      circuit([a, b, xor, led], [wire(a, 0, xor, 0), wire(b, 0, xor, 1), wire(xor, 0, led, 0)]),
    );
    expect(sumOfProducts(table, 0)).toBe("A'·B + A·B'");
  });

  it('collapses constants', () => {
    const a = gate('INPUT', { position: { x: 0, y: 0 } });
    const hi = gate('CONSTANT_HIGH', { position: { x: 50, y: 0 } });
    const led = gate('OUTPUT', { position: { x: 200, y: 0 } });
    const table = buildTruthTable(circuit([a, hi, led], [wire(hi, 0, led, 0)]));
    expect(sumOfProducts(table, 0)).toBe('1');
  });
});
