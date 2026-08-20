import { useCallback, useRef, useState } from 'react';
import type { CircuitState, ElementId } from '@/types/circuit';

// ---------------------------------------------------------------
// Marquee box state
// ---------------------------------------------------------------

export interface MarqueeBox {
  /** Start position in screen coordinates */
  startX: number;
  startY: number;
  /** Current end position in screen coordinates */
  endX: number;
  endY: number;
}

// ---------------------------------------------------------------
// useSelection hook
// ---------------------------------------------------------------

export interface UseSelectionReturn {
  /** Currently selected gate IDs */
  selectedGateIds: ElementId[];
  /** Active marquee selection box (null when not dragging) */
  marqueeBox: MarqueeBox | null;
  /** Start a marquee drag from screen coordinates */
  startMarquee: (sx: number, sy: number) => void;
  /** Update the marquee end position */
  updateMarquee: (sx: number, sy: number) => void;
  /** Clear the marquee box */
  clearMarquee: () => void;
  /** Set selection from marquee result gate IDs */
  setMarqueeSelection: (
    gateIds: ElementId[],
    circuit: CircuitState,
    onCircuitChange: (circuit: CircuitState) => void,
  ) => void;
  /** Toggle a single gate in/out of selection (for shift+click) */
  toggleGateSelection: (
    gateId: ElementId,
    circuit: CircuitState,
    onCircuitChange: (circuit: CircuitState) => void,
  ) => void;
  /** Select a single gate (replace current selection) */
  selectGate: (
    gateId: ElementId,
    circuit: CircuitState,
    onCircuitChange: (circuit: CircuitState) => void,
  ) => void;
  /** Select all gates */
  selectAll: (
    circuit: CircuitState,
    onCircuitChange: (circuit: CircuitState) => void,
  ) => void;
  /** Clear all selection */
  clearSelection: (
    circuit: CircuitState,
    onCircuitChange: (circuit: CircuitState) => void,
  ) => void;
  /** Delete selected gates and their connected wires */
  deleteSelected: (
    circuit: CircuitState,
    onCircuitChange: (circuit: CircuitState) => void,
  ) => void;
  /** Check if a gate is selected */
  isGateSelected: (gateId: ElementId) => boolean;
  /** Get the start position for drag-move (stores original positions) */
  startDragMove: (circuit: CircuitState) => void;
  /** Move all selected gates by delta from their original positions */
  moveSelectedGates: (
    dx: number,
    dy: number,
    circuit: CircuitState,
    onCircuitChange: (circuit: CircuitState) => void,
  ) => void;
}

export const useSelection = (): UseSelectionReturn => {
  const [selectedGateIds, setSelectedGateIds] = useState<ElementId[]>([]);
  const [marqueeBox, setMarqueeBox] = useState<MarqueeBox | null>(null);
  const dragStartRef = useRef<Map<ElementId, { x: number; y: number }>>(new Map());

  const startMarquee = useCallback((sx: number, sy: number) => {
    setMarqueeBox({ startX: sx, startY: sy, endX: sx, endY: sy });
  }, []);

  const updateMarquee = useCallback((sx: number, sy: number) => {
    setMarqueeBox((prev) =>
      prev ? { ...prev, endX: sx, endY: sy } : null,
    );
  }, []);

  const clearMarquee = useCallback(() => {
    setMarqueeBox(null);
  }, []);

  const setMarqueeSelection = useCallback(
    (
      gateIds: ElementId[],
      circuit: CircuitState,
      onCircuitChange: (circuit: CircuitState) => void,
    ) => {
      setSelectedGateIds(gateIds);
      setMarqueeBox(null);
      if (onCircuitChange) {
        onCircuitChange({ ...circuit, selectedGateIds: gateIds, selectedElementId: null });
      }
    },
    [],
  );

  const toggleGateSelection = useCallback(
    (
      gateId: ElementId,
      circuit: CircuitState,
      onCircuitChange: (circuit: CircuitState) => void,
    ) => {
      setSelectedGateIds((prev) => {
        const next = prev.includes(gateId)
          ? prev.filter((id) => id !== gateId)
          : [...prev, gateId];
        if (onCircuitChange) {
          onCircuitChange({ ...circuit, selectedGateIds: next, selectedElementId: null });
        }
        return next;
      });
    },
    [],
  );

  const selectGate = useCallback(
    (
      gateId: ElementId,
      circuit: CircuitState,
      onCircuitChange: (circuit: CircuitState) => void,
    ) => {
      setSelectedGateIds([gateId]);
      if (onCircuitChange) {
        onCircuitChange({ ...circuit, selectedGateIds: [gateId], selectedElementId: null });
      }
    },
    [],
  );

  const selectAll = useCallback(
    (circuit: CircuitState, onCircuitChange: (circuit: CircuitState) => void) => {
      const allIds = circuit.gates.map((g) => g.id);
      setSelectedGateIds(allIds);
      if (onCircuitChange) {
        onCircuitChange({ ...circuit, selectedGateIds: allIds, selectedElementId: null });
      }
    },
    [],
  );

  const clearSelection = useCallback(
    (circuit: CircuitState, onCircuitChange: (circuit: CircuitState) => void) => {
      setSelectedGateIds([]);
      if (onCircuitChange) {
        onCircuitChange({ ...circuit, selectedGateIds: [], selectedElementId: null });
      }
    },
    [],
  );

  const deleteSelected = useCallback(
    (circuit: CircuitState, onCircuitChange: (circuit: CircuitState) => void) => {
      if (selectedGateIds.length === 0) return;

      const newGates = circuit.gates.filter((g) => !selectedGateIds.includes(g.id));
      const newWires = circuit.wires.filter(
        (w) =>
          !selectedGateIds.includes(w.fromGateId) &&
          !selectedGateIds.includes(w.toGateId),
      );

      setSelectedGateIds([]);
      if (onCircuitChange) {
        onCircuitChange({
          ...circuit,
          gates: newGates,
          wires: newWires,
          selectedGateIds: [],
          selectedElementId: null,
        });
      }
    },
    [selectedGateIds],
  );

  const isGateSelected = useCallback(
    (gateId: ElementId) => selectedGateIds.includes(gateId),
    [selectedGateIds],
  );

  const startDragMove = useCallback(
    (circuit: CircuitState) => {
      const positions = new Map<ElementId, { x: number; y: number }>();
      for (const gate of circuit.gates) {
        if (selectedGateIds.includes(gate.id)) {
          positions.set(gate.id, { x: gate.position.x, y: gate.position.y });
        }
      }
      dragStartRef.current = positions;
    },
    [selectedGateIds],
  );

  const moveSelectedGates = useCallback(
    (
      dx: number,
      dy: number,
      circuit: CircuitState,
      onCircuitChange: (circuit: CircuitState) => void,
    ) => {
      if (selectedGateIds.length === 0) return;

      const newGates = circuit.gates.map((g) => {
        if (selectedGateIds.includes(g.id)) {
          const original = dragStartRef.current.get(g.id);
          if (original) {
            return { ...g, position: { x: original.x + dx, y: original.y + dy } };
          }
        }
        return g;
      });

      if (onCircuitChange) {
        onCircuitChange({ ...circuit, gates: newGates });
      }
    },
    [selectedGateIds],
  );

  return {
    selectedGateIds,
    marqueeBox,
    startMarquee,
    updateMarquee,
    clearMarquee,
    setMarqueeSelection,
    toggleGateSelection,
    selectGate,
    selectAll,
    clearSelection,
    deleteSelected,
    isGateSelected,
    startDragMove,
    moveSelectedGates,
  };
};
