import { describe, expect, it } from 'vitest';
import { ALL_GATE_TYPES, GATE_ICONS, clampFanIn, getConfigForGate, getGateConfig } from '@/utils/gateConfigs';
import { MAX_FAN_IN, MIN_FAN_IN } from '@/types/circuit';
import { gate } from './testHelpers';

describe('gate geometry', () => {
  it('spaces ports down the gate height, never the width', () => {
    // The original bug: port Y was computed from `width`, so ports
    // sat outside the shape on any gate that was not square.
    const cfg = getGateConfig('AND', 2);
    for (const port of [...cfg.inputs, ...cfg.outputs]) {
      expect(port.offset.y).toBeGreaterThan(0);
      expect(port.offset.y).toBeLessThan(cfg.height);
    }
  });

  it('puts inputs on the left edge and outputs on the right edge', () => {
    for (const type of ALL_GATE_TYPES) {
      const cfg = getGateConfig(type);
      for (const p of cfg.inputs) expect(p.offset.x).toBe(0);
      for (const p of cfg.outputs) expect(p.offset.x).toBe(cfg.width);
    }
  });

  it('centres a single output vertically', () => {
    const cfg = getGateConfig('AND', 2);
    expect(cfg.outputs[0].offset.y).toBeCloseTo(cfg.height / 2);
  });

  it('grows the body as inputs are added, keeping them evenly spaced', () => {
    const two = getGateConfig('AND', 2);
    const six = getGateConfig('AND', 6);
    expect(six.height).toBeGreaterThan(two.height);
    expect(six.inputs).toHaveLength(6);

    const gaps = six.inputs.slice(1).map((p, i) => p.offset.y - six.inputs[i].offset.y);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0]);
  });

  it('clamps fan-in to the supported range', () => {
    expect(clampFanIn('AND', 1)).toBe(MIN_FAN_IN);
    expect(clampFanIn('AND', 99)).toBe(MAX_FAN_IN);
    expect(clampFanIn('AND', undefined)).toBe(2);
    // Fixed-arity types ignore the request entirely
    expect(clampFanIn('NOT', 5)).toBe(1);
    expect(clampFanIn('INPUT', 3)).toBe(0);
  });

  it('honours a gate instance custom fan-in', () => {
    expect(getConfigForGate(gate('OR', { inputCount: 4 })).inputs).toHaveLength(4);
  });

  it('gives every gate type an icon', () => {
    for (const type of ALL_GATE_TYPES) {
      expect(GATE_ICONS[type]).toBeTruthy();
    }
  });

  it('gives flip-flops two outputs, Q and its complement', () => {
    const cfg = getGateConfig('D_FLIPFLOP');
    expect(cfg.outputs).toHaveLength(2);
    expect(cfg.inputs.map((p) => p.name)).toEqual(['D', 'CLK']);
  });
});

describe('grid alignment', () => {
  it('places every port on a whole-number offset', () => {
    for (const type of ALL_GATE_TYPES) {
      for (const n of [2, 3, 5, 8]) {
        const cfg = getGateConfig(type, n);
        for (const p of [...cfg.inputs, ...cfg.outputs]) {
          expect(Number.isInteger(p.offset.y)).toBe(true);
          expect(Number.isInteger(p.offset.x)).toBe(true);
        }
      }
    }
  });

  it('spaces multi-input pins exactly one grid step apart', () => {
    // The canvas snaps to 20, so pins spaced on 20 let gates dropped on
    // the grid line up without nudging.
    const cfg = getGateConfig('AND', 4);
    const gaps = cfg.inputs.slice(1).map((p, i) => p.offset.y - cfg.inputs[i].offset.y);
    for (const g of gaps) expect(g).toBe(20);
  });
});
