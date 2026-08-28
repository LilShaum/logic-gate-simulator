// ============================================================
// useHistory — Command-pattern undo/redo for circuit operations
// ============================================================

import { useCallback, useRef, useState } from 'react';
import type { CircuitState } from '@/types/circuit';

/** A snapshot of the circuit state stored in history */
interface HistoryEntry {
  circuit: CircuitState;
  label: string;
}

export interface UseHistoryReturn {
  /** Push a new circuit state onto the undo stack */
  pushState: (circuit: CircuitState, label: string) => void;
  /** Undo the last operation, returns the previous circuit state or null */
  undo: () => CircuitState | null;
  /** Redo the last undone operation, returns the circuit state or null */
  redo: () => CircuitState | null;
  /** Whether undo is possible */
  canUndo: boolean;
  /** Whether redo is possible */
  canRedo: boolean;
  /** Number of undo steps available */
  undoCount: number;
  /** Number of redo steps available */
  redoCount: number;
  /** Current undo label (for UI display) */
  undoLabel: string | null;
  /** Current redo label (for UI display) */
  redoLabel: string | null;
  /** Drop all history, e.g. when a different circuit is opened */
  clear: () => void;
}

const MAX_HISTORY = 100;

export const useHistory = (): UseHistoryReturn => {
  // Stack of past states (most recent at end)
  const pastRef = useRef<HistoryEntry[]>([]);
  // Stack of future states (most recent at end)
  const futureRef = useRef<HistoryEntry[]>([]);
  // Force re-renders when history changes
  const [, forceRender] = useState(0);

  const pushState = useCallback((circuit: CircuitState, label: string) => {
    const entry: HistoryEntry = {
      circuit: JSON.parse(JSON.stringify(circuit)),
      label,
    };
    pastRef.current.push(entry);

    // Enforce max history size
    if (pastRef.current.length > MAX_HISTORY) {
      pastRef.current = pastRef.current.slice(pastRef.current.length - MAX_HISTORY);
    }

    // Clear redo stack on new action
    futureRef.current = [];

    forceRender((n) => n + 1);
  }, []);

  const undo = useCallback((): CircuitState | null => {
    if (pastRef.current.length === 0) return null;

    const entry = pastRef.current.pop()!;
    futureRef.current.push(entry);

    forceRender((n) => n + 1);

    // Return the previous state (the one before the undone action)
    if (pastRef.current.length > 0) {
      return pastRef.current[pastRef.current.length - 1].circuit;
    }
    return null;
  }, []);

  const redo = useCallback((): CircuitState | null => {
    if (futureRef.current.length === 0) return null;

    const entry = futureRef.current.pop()!;
    pastRef.current.push(entry);

    forceRender((n) => n + 1);

    return entry.circuit;
  }, []);

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;
  const undoCount = pastRef.current.length;
  const redoCount = futureRef.current.length;
  const undoLabel =
    pastRef.current.length > 0
      ? pastRef.current[pastRef.current.length - 1].label
      : null;
  const redoLabel =
    futureRef.current.length > 0
      ? futureRef.current[futureRef.current.length - 1].label
      : null;

  const clear = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    forceRender((n) => n + 1);
  }, []);

  return {
    clear,
    pushState,
    undo,
    redo,
    canUndo,
    canRedo,
    undoCount,
    redoCount,
    undoLabel,
    redoLabel,
  };
};
