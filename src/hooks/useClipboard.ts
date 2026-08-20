// ============================================================
// useClipboard — in-memory + localStorage clipboard for copy/paste
// ============================================================

import { useCallback, useRef, useState } from 'react';
import type { CircuitState, ElementId } from '@/types/circuit';
import {
  copySelection,
  deserializePaste,
  persistClipboard,
  loadClipboard,
  type ClipboardData,
} from '@/utils/clipboardUtils';

export interface UseClipboardReturn {
  /** True when there is data on the clipboard */
  hasClipboard: boolean;

  /** Copy the currently selected gates to clipboard */
  copy: (
    circuit: CircuitState,
    selectedGateIds: ElementId[],
  ) => boolean;

  /**
   * Paste clipboard contents into the circuit at `pastePosition` (world coords).
   * Returns the updated circuit (caller should propagate via onCircuitChange).
   */
  paste: (
    circuit: CircuitState,
    pastePosition: { x: number; y: number },
  ) => CircuitState | null;

  /** Clear the clipboard (both in-memory and localStorage) */
  clear: () => void;
}

export const useClipboard = (): UseClipboardReturn => {
  const [hasClipboard, setHasClipboard] = useState<boolean>(() => {
    return loadClipboard() !== null;
  });

  // In-memory clipboard data (preferred over localStorage)
  const memoryRef = useRef<ClipboardData | null>(null);

  // ----- Copy -----
  const copy = useCallback(
    (circuit: CircuitState, selectedGateIds: ElementId[]): boolean => {
      const data = copySelection(circuit, selectedGateIds);
      if (!data) return false;

      memoryRef.current = data;
      persistClipboard(data);
      setHasClipboard(true);
      return true;
    },
    [],
  );

  // ----- Paste -----
  const paste = useCallback(
    (
      circuit: CircuitState,
      pastePosition: { x: number; y: number },
    ): CircuitState | null => {
      // Prefer in-memory, fall back to localStorage
      const data = memoryRef.current ?? loadClipboard();
      if (!data) return null;

      const { newGates, newWires } = deserializePaste(data, pastePosition);

      return {
        ...circuit,
        gates: [...circuit.gates, ...newGates],
        wires: [...circuit.wires, ...newWires],
        // Select the newly pasted gates
        selectedGateIds: newGates.map((g) => g.id),
        selectedElementId: null,
      };
    },
    [],
  );

  // ----- Clear -----
  const clear = useCallback(() => {
    memoryRef.current = null;
    setHasClipboard(false);
    // Note: we do NOT clear localStorage here — the clipboard should
    // persist across sessions. Only an explicit action should clear it.
  }, []);

  return { hasClipboard, copy, paste, clear };
};
