// ============================================================
// useSimulation — owns the tick timer and the persistent state
// of sequential elements.
//
// Note that *evaluation* is not gated on the simulation running.
// The circuit is always live: editing a wire or flipping a switch
// re-evaluates immediately. Running only matters for elements that
// need the passage of time, i.e. CLOCK primitives.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CircuitState,
  CustomBlockDefinition,
  SimulationSpeed,
  SimulationState,
} from '@/types/circuit';
import { SPEED_INTERVALS } from '@/types/circuit';
import type { MemoryStore } from '@/utils/simulation';
import { evaluateCircuit, resetCircuitState } from '@/utils/simulation';

const initialSimState: SimulationState = {
  mode: 'stopped',
  speed: 'normal',
  tick: 0,
  oscillating: false,
};

interface UseSimulationReturn {
  simulation: SimulationState;
  /** Re-evaluate without advancing time. Use after any circuit edit. */
  evaluate: (circuit: CircuitState) => CircuitState;
  /** Advance one tick (clocks move, flip-flops see edges) */
  step: () => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  /** Stop, clear stored flip-flop state and zero the tick counter */
  reset: () => void;
  setSpeed: (speed: SimulationSpeed) => void;
}

export const useSimulation = (
  circuit: CircuitState,
  onCircuitChange: (c: CircuitState) => void,
  blocks: CustomBlockDefinition[] = [],
): UseSimulationReturn => {
  const [simulation, setSimulation] = useState<SimulationState>(initialSimState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Latest-value refs, so timer callbacks never read stale state
  const circuitRef = useRef(circuit);
  const blocksRef = useRef(blocks);
  const onChangeRef = useRef(onCircuitChange);
  const speedRef = useRef<SimulationSpeed>(initialSimState.speed);
  /** Sequential state for elements nested inside custom blocks */
  const memoryRef = useRef<MemoryStore>(new Map());

  useEffect(() => {
    circuitRef.current = circuit;
  }, [circuit]);
  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);
  useEffect(() => {
    onChangeRef.current = onCircuitChange;
  }, [onCircuitChange]);

  /** Evaluate a circuit in place, without advancing time */
  const evaluate = useCallback((c: CircuitState): CircuitState => {
    const { circuit: next, stable } = evaluateCircuit(c, {
      blocks: blocksRef.current,
      memoryStore: memoryRef.current,
    });
    setSimulation((prev) =>
      prev.oscillating === !stable ? prev : { ...prev, oscillating: !stable },
    );
    return next;
  }, []);

  const stepInternal = useCallback(() => {
    const { circuit: next, stable } = evaluateCircuit(circuitRef.current, {
      blocks: blocksRef.current,
      memoryStore: memoryRef.current,
      advanceTick: true,
    });
    circuitRef.current = next;
    onChangeRef.current(next);
    setSimulation((prev) => ({ ...prev, tick: prev.tick + 1, oscillating: !stable }));
  }, []);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(
    (speed: SimulationSpeed) => {
      clearTimer();
      intervalRef.current = setInterval(stepInternal, SPEED_INTERVALS[speed]);
    },
    [clearTimer, stepInternal],
  );

  const step = useCallback(() => {
    // A manual step while running would double-tick; pause first.
    stepInternal();
  }, [stepInternal]);

  const start = useCallback(() => {
    setSimulation((prev) => ({ ...prev, mode: 'running' }));
    startTimer(speedRef.current);
  }, [startTimer]);

  const pause = useCallback(() => {
    clearTimer();
    setSimulation((prev) => ({ ...prev, mode: 'paused' }));
  }, [clearTimer]);

  const resume = start;

  const reset = useCallback(() => {
    clearTimer();
    memoryRef.current.clear();
    const cleared = resetCircuitState(circuitRef.current, {
      blocks: blocksRef.current,
      memoryStore: memoryRef.current,
    });
    circuitRef.current = cleared;
    onChangeRef.current(cleared);
    setSimulation({ ...initialSimState, speed: speedRef.current });
  }, [clearTimer]);

  const setSpeed = useCallback(
    (speed: SimulationSpeed) => {
      speedRef.current = speed;
      setSimulation((prev) => {
        if (prev.mode === 'running') startTimer(speed);
        return { ...prev, speed };
      });
    },
    [startTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { simulation, evaluate, step, start, pause, resume, reset, setSpeed };
};
