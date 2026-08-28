import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  buildDocument,
  deserializeDocument,
  parseDocument,
  serializeDocument,
} from '@/utils/persistence';
import { circuit, gate, wire } from './testHelpers';

describe('document round-trip', () => {
  it('preserves gates, wires and labels', () => {
    const a = gate('INPUT', { outputState: true, label: 'A', position: { x: 40, y: 60 } });
    const and = gate('AND', { inputCount: 3 });
    const led = gate('OUTPUT', { label: 'Y' });
    const c = circuit([a, and, led], [wire(a, 0, and, 0), wire(and, 0, led, 0)]);

    const doc = buildDocument('My circuit', c, []);
    const back = deserializeDocument(serializeDocument(doc));

    expect(back).not.toBeNull();
    expect(back!.name).toBe('My circuit');
    expect(back!.version).toBe(SCHEMA_VERSION);
    expect(back!.circuit.gates).toHaveLength(3);
    expect(back!.circuit.wires).toHaveLength(2);

    const restoredA = back!.circuit.gates.find((g) => g.id === a.id)!;
    expect(restoredA.label).toBe('A');
    expect(restoredA.outputState).toBe(true);
    expect(restoredA.position).toEqual({ x: 40, y: 60 });
    expect(back!.circuit.gates.find((g) => g.id === and.id)!.inputCount).toBe(3);
  });

  it('does not persist the current selection', () => {
    const a = gate('INPUT');
    const c = { ...circuit([a], []), selectedGateIds: [a.id], selectedElementId: a.id };
    const doc = buildDocument('x', c, []);
    expect(doc.circuit.selectedGateIds).toEqual([]);
    expect(doc.circuit.selectedElementId).toBeNull();
  });

  it('round-trips flip-flop memory', () => {
    const ff = gate('D_FLIPFLOP', { memory: { q: true, lastClk: true } });
    const back = deserializeDocument(serializeDocument(buildDocument('x', circuit([ff], []), [])));
    expect(back!.circuit.gates[0].memory?.q).toBe(true);
  });
});

describe('parsing untrusted input', () => {
  it('rejects garbage instead of throwing', () => {
    expect(deserializeDocument('not json at all')).toBeNull();
    expect(deserializeDocument('[]')).toBeNull();
    expect(parseDocument(null)).toBeNull();
    expect(parseDocument(42)).toBeNull();
  });

  it('drops malformed gates rather than importing them', () => {
    const doc = parseDocument({
      circuit: {
        gates: [
          { id: 'ok', type: 'AND', position: { x: 1, y: 2 } },
          { type: 'AND' }, // no id
          null,
          'nonsense',
        ],
        wires: [],
      },
    });
    expect(doc!.circuit.gates.map((g) => g.id)).toEqual(['ok']);
  });

  it('drops wires whose endpoints did not survive validation', () => {
    const doc = parseDocument({
      circuit: {
        gates: [{ id: 'a', type: 'INPUT', position: { x: 0, y: 0 } }],
        wires: [
          { id: 'w1', fromGateId: 'a', fromPortIndex: 0, toGateId: 'ghost', toPortIndex: 0 },
        ],
      },
    });
    expect(doc!.circuit.wires).toEqual([]);
  });

  it('repairs non-finite coordinates', () => {
    const doc = parseDocument({
      circuit: {
        gates: [{ id: 'a', type: 'AND', position: { x: NaN, y: 'oops' } }],
        wires: [],
      },
    });
    expect(doc!.circuit.gates[0].position).toEqual({ x: 0, y: 0 });
  });

  it('accepts a bare circuit with no envelope', () => {
    const doc = parseDocument({
      gates: [{ id: 'a', type: 'AND', position: { x: 0, y: 0 } }],
      wires: [],
    });
    expect(doc).not.toBeNull();
    expect(doc!.circuit.gates).toHaveLength(1);
  });
});
