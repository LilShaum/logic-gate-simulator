// ============================================================
// useSimulation — manages simulation lifecycle, auto-step timer
// ============================================================

import { useRef, useCallback, useEffect, useState } from 'react';
import type {
  CircuitState,
  SimulationSpeed,
  SimulationState,
} from '@/types/circuit';
import { SPEED_INTERVALS } from '@/types/circuit';
import { simulationStep } from '@/utils/simulation';

const initialSimState: SimulationState = {
  mode: 'stopped',
  speed: 'normal',
  tick: 0,
};

interface UseSimulationReturn {
  simulation: SimulationState;
  /** Run a single simulation step */
  step: () => void;
  /** Start auto-stepping */
  start: () => void;
  /** Pause auto-stepping (keeps tick count) */
  pause: () => void;
  /** Resume from pause */
  resume: () => void;
  /** Stop and reset tick to 0 */
  reset: () => void;
  /** Change speed preset */
  setSpeed: (speed: SimulationSpeed) => void;
}

export const useSimulation = (
  circuit: CircuitState,
  onCircuitChange: (c: CircuitState) => void,
): UseSimulationReturn => {
  const [simulation, setSimulation] = useState<SimulationState>(initialSimState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const circuitRef = useRef(circuit);

  // Keep circuitRef current
  useEffect(() => {
    circuitRef.current = circuit;
  }, [circuit]);

  const stepInternal = useCallback(() => {
    const updated = simulationStep(circuitRef.current);
    onCircuitChange(updated);
    setSimulation((prev) => ({ ...prev, tick: prev.tick + 1 }));
  }, [onCircuitChange]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(
    (speed: SimulationSpeed) => {
      clearTimer();
      intervalRef.current = setInterval(() => {
        stepInternal();
      }, SPEED_INTERVALS[speed]);
    },
    [clearTimer, stepInternal],
  );

  const step = useCallback(() => {
    stepInternal();
  }, [stepInternal]);

  const start = useCallback(() => {
    setSimulation((prev) => ({ ...prev, mode: 'running' }));
    startTimer(simulation.speed);
  }, [startTimer, simulation.speed]);

  const pause = useCallback(() => {
    clearTimer();
    setSimulation((prev) => ({ ...prev, mode: 'paused' }));
  }, [clearTimer]);

  const resume = useCallback(() => {
    setSimulation((prev) => ({ ...prev, mode: 'running' }));
    startTimer(simulation.speed);
  }, [startTimer, simulation.speed]);

  const reset = useCallback(() => {
    clearTimer();
    setSimulation(initialSimState);
  }, [clearTimer]);

  const setSpeed = useCallback(
    (speed: SimulationSpeed) => {
      setSimulation((prev) => {
        const next = { ...prev, speed };
        // If currently running, restart timer with new speed
        if (prev.mode === 'running') {
          clearTimer();
          // Use a timeout to avoid stale closure
          setTimeout(() => startTimer(speed), 0);
        }
        return next;
      });
    },
    [clearTimer, startTimer],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  return {
    simulation,
    step,
    start,
    pause,
    resume,
    reset,
    setSpeed,
  };
};
