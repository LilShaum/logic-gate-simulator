import { CanvasEditor, SimulationControls, Toolbar } from '@/components';
import { BlockLibrary } from '@/components/BlockLibrary';
import { CreateBlockDialog } from '@/components/CreateBlockDialog';
import { Toast } from '@/components/Toast';
import { StatusBar } from '@/components/StatusBar';
import type {
  CircuitState,
  CustomBlockDefinition,
  ElementId,
  GateType,
  Viewport,
} from '@/types/circuit';
import { generateId } from '@/utils/generateId';
import { analyzeSelection, expandBlockInstance, createBlockInstance } from '@/utils/blockUtils';
import { useSimulation } from '@/hooks/useSimulation';
import { useBlocks } from '@/hooks/useBlocks';
import { useHistory } from '@/hooks/useHistory';
import { useState, useCallback, useEffect, useRef } from 'react';
import { showToast } from '@/utils/toastService';
import './styles.css';

// ---------------------------------------------------------------
// Seed a small demo circuit so the canvas isn't empty
// ---------------------------------------------------------------
const seedCircuit: CircuitState = {
  gates: [
    {
      id: generateId(),
      type: 'INPUT',
      position: { x: 80, y: 120 },
      outputState: false,
    },
    {
      id: generateId(),
      type: 'AND',
      position: { x: 280, y: 100 },
      outputState: false,
    },
    {
      id: generateId(),
      type: 'OR',
      position: { x: 280, y: 220 },
      outputState: false,
    },
    {
      id: generateId(),
      type: 'NOT',
      position: { x: 480, y: 160 },
      outputState: false,
    },
    {
      id: generateId(),
      type: 'OUTPUT',
      position: { x: 620, y: 160 },
      outputState: false,
    },
  ],
  wires: [],
  selectedElementId: null,
  selectedGateIds: [],
};

const initialViewport: Viewport = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
};

export default function App() {
  const [circuit, setCircuit] = useState<CircuitState>(seedCircuit);
  const [viewport, setViewport] = useState<Viewport>(initialViewport);

  // Custom blocks management
  const blocks = useBlocks();

  // History (undo/redo)
  const history = useHistory();
  // Track the circuit state before a drag operation for history batching
  const preDragCircuitRef = useRef<CircuitState | null>(null);
  // Skip next history push (used during undo/redo to avoid re-pushing)
  const skipHistoryRef = useRef(false);

  // Grid snap toggle
  const [gridSnapEnabled, setGridSnapEnabled] = useState(true);

  // Click-to-place mode: user clicks a gate in palette, then clicks canvas to place
  const [pendingGateType, setPendingGateType] = useState<GateType | null>(null);
  const [pendingBlockId, setPendingBlockId] = useState<ElementId | null>(null);

  // Create block dialog state
  const [createDialogVisible, setCreateDialogVisible] = useState(false);
  const [createDialogInputCount, setCreateDialogInputCount] = useState(0);
  const [createDialogOutputCount, setCreateDialogOutputCount] = useState(0);

  // Block editing mode
  const [editingBlockId, setEditingBlockId] = useState<ElementId | null>(null);
  const [editingCircuit, setEditingCircuit] = useState<CircuitState | null>(null);
  /** Store the original circuit state before entering edit mode */
  const [preEditCircuit, setPreEditCircuit] = useState<CircuitState | null>(null);

  const {
    simulation,
    step,
    start,
    pause,
    resume,
    reset,
    setSpeed,
  } = useSimulation(editingBlockId ? (editingCircuit ?? circuit) : circuit, (newCircuit) => {
    if (editingBlockId) {
      setEditingCircuit(newCircuit);
    } else {
      setCircuit(newCircuit);
    }
  });

  const handleCircuitChange = useCallback(
    (newCircuit: CircuitState) => {
      if (editingBlockId) {
        setEditingCircuit(newCircuit);
        return;
      }

      // Push the current state to history before applying the change
      if (!skipHistoryRef.current) {
        history.pushState(circuit, 'Edit');
      }
      skipHistoryRef.current = false;
      setCircuit(newCircuit);
    },
    [editingBlockId, circuit, history],
  );

  // ---------------------------------------------------------------
  // Drag start/end for history batching
  // ---------------------------------------------------------------

  const handleDragStart = useCallback(() => {
    preDragCircuitRef.current = JSON.parse(JSON.stringify(circuit));
  }, [circuit]);

  const handleDragEnd = useCallback(() => {
    if (preDragCircuitRef.current) {
      // Push the pre-drag state to history as a single undo step
      history.pushState(preDragCircuitRef.current, 'Move gate');
      preDragCircuitRef.current = null;
    }
  }, [history]);

  // ---------------------------------------------------------------
  // Undo / Redo
  // ---------------------------------------------------------------

  const handleUndo = useCallback(() => {
    const restored = history.undo();
    if (restored) {
      skipHistoryRef.current = true;
      setCircuit(restored);
    }
  }, [history]);

  const handleRedo = useCallback(() => {
    const restored = history.redo();
    if (restored) {
      skipHistoryRef.current = true;
      setCircuit(restored);
    }
  }, [history]);

  // Global keyboard shortcuts for undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const isCtrl = e.ctrlKey || e.metaKey;

      if (isCtrl && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
      if (isCtrl && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  // ---------------------------------------------------------------
  // Toolbar handlers
  // ---------------------------------------------------------------

  // Smooth viewport animation (ease-out cubic) for zoom/reset/fit
  const viewportAnimRafRef = useRef(0);

  const animateViewportTo = useCallback(
    (target: Partial<Viewport>, duration = 220) => {
      const from: Viewport = { ...viewport };
      const to: Viewport = {
        zoom: Math.min(Math.max(target.zoom ?? from.zoom, 0.15), 5),
        offsetX: target.offsetX ?? from.offsetX,
        offsetY: target.offsetY ?? from.offsetY,
      };
      if (viewportAnimRafRef.current) {
        cancelAnimationFrame(viewportAnimRafRef.current);
      }
      const startTime = performance.now();
      const stepFn = (now: number) => {
        const t = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        setViewport({
          zoom: from.zoom + (to.zoom - from.zoom) * eased,
          offsetX: from.offsetX + (to.offsetX - from.offsetX) * eased,
          offsetY: from.offsetY + (to.offsetY - from.offsetY) * eased,
        });
        if (t < 1) {
          viewportAnimRafRef.current = requestAnimationFrame(stepFn);
        } else {
          viewportAnimRafRef.current = 0;
        }
      };
      viewportAnimRafRef.current = requestAnimationFrame(stepFn);
    },
    [viewport],
  );

  const handleViewportChange = useCallback((vp: Viewport) => {
    // User-driven pan/zoom cancels any running animation
    if (viewportAnimRafRef.current) {
      cancelAnimationFrame(viewportAnimRafRef.current);
      viewportAnimRafRef.current = 0;
    }
    setViewport(vp);
  }, []);

  const handleZoomIn = useCallback(() => {
    animateViewportTo({ zoom: viewport.zoom * 1.2 });
  }, [animateViewportTo, viewport]);

  const handleZoomOut = useCallback(() => {
    animateViewportTo({ zoom: viewport.zoom * 0.8 });
  }, [animateViewportTo, viewport]);

  const handleResetView = useCallback(() => {
    animateViewportTo({ zoom: 1, offsetX: 0, offsetY: 0 }, 260);
  }, [animateViewportTo]);

  const handleFitAll = useCallback(() => {
    if (circuit.gates.length === 0) {
      handleResetView();
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const gate of circuit.gates) {
      if (gate.position.x < minX) minX = gate.position.x;
      if (gate.position.y < minY) minY = gate.position.y;
      if (gate.position.x + 80 > maxX) maxX = gate.position.x + 80;
      if (gate.position.y + 60 > maxY) maxY = gate.position.y + 60;
    }
    const canvas = document.querySelector('canvas');
    const canvasW = canvas?.width ?? window.innerWidth;
    const canvasH = canvas?.height ?? window.innerHeight;
    const contentW = maxX - minX + 100;
    const contentH = maxY - minY + 100;
    const scaleX = canvasW / contentW;
    const scaleY = canvasH / contentH;
    const zoom = Math.min(scaleX, scaleY, 5);
    const clampedZoom = Math.max(zoom, 0.15);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    animateViewportTo(
      {
        zoom: clampedZoom,
        offsetX: canvasW / 2 - centerX * clampedZoom,
        offsetY: canvasH / 2 - centerY * clampedZoom,
      },
      300,
    );
  }, [circuit.gates, handleResetView, animateViewportTo]);

  const handleToggleGridSnap = useCallback(() => {
    setGridSnapEnabled((prev) => !prev);
  }, []);

  // ---------------------------------------------------------------
  // Determine what circuit to show (declared early for handlers below)
  // ---------------------------------------------------------------

  const activeCircuit = editingBlockId && editingCircuit ? editingCircuit : circuit;

  // ---------------------------------------------------------------
  // Click-to-place mode
  // ---------------------------------------------------------------

  const handleSelectGateForPlacement = useCallback((gateType: GateType) => {
    setPendingGateType((prev) => (prev === gateType ? null : gateType));
    setPendingBlockId(null);
  }, []);

  const handleSelectBlockForPlacement = useCallback((blockId: ElementId) => {
    setPendingBlockId((prev) => (prev === blockId ? null : blockId));
    setPendingGateType(null);
  }, []);

  const handlePlaceGate = useCallback(
    (gateType: GateType, position: { x: number; y: number }) => {
      const newGate = {
        id: generateId(),
        type: gateType,
        position,
        outputState: false,
      };
      if (handleCircuitChange) {
        handleCircuitChange({
          ...activeCircuit,
          gates: [...activeCircuit.gates, newGate],
          selectedGateIds: [newGate.id],
          selectedElementId: null,
        });
        showToast(`Placed ${gateType} gate`);
      }
    },
    [activeCircuit, handleCircuitChange],
  );

  const handlePlaceBlock = useCallback(
    (blockId: ElementId, position: { x: number; y: number }) => {
      const blockDef = blocks.customBlocks.find((b) => b.id === blockId);
      if (!blockDef) return;
      const instance = createBlockInstance(blockId, position);
      if (handleCircuitChange) {
        handleCircuitChange({
          ...activeCircuit,
          gates: [...activeCircuit.gates, instance],
          selectedGateIds: [instance.id],
          selectedElementId: null,
        });
        showToast(`Placed block: ${blockDef.name}`);
      }
    },
    [activeCircuit, handleCircuitChange, blocks.customBlocks],
  );

  const handleCancelPlacement = useCallback(() => {
    setPendingGateType(null);
    setPendingBlockId(null);
  }, []);

  // ---------------------------------------------------------------
  // Create Block flow
  // ---------------------------------------------------------------

  const handleCreateBlockRequest = useCallback(() => {
    const analysis = analyzeSelection(circuit, circuit.selectedGateIds);
    if (!analysis) {
      showToast('Select gates to create a block');
      return;
    }
    if (analysis.inputGates.length === 0 && analysis.outputGates.length === 0) {
      showToast('Selection needs INPUT and/or OUTPUT gates');
      return;
    }

    setCreateDialogInputCount(analysis.inputGates.length);
    setCreateDialogOutputCount(analysis.outputGates.length);
    setCreateDialogVisible(true);
  }, [circuit]);

  const handleCreateBlock = useCallback(
    (name: string, description: string, icon: string) => {
      const blockDef = blocks.createBlock(
        name,
        description,
        icon,
        circuit,
        circuit.selectedGateIds,
      );

      if (blockDef) {
        showToast(`Created block: ${blockDef.name}`);

        // Push pre-creation state to history
        history.pushState(circuit, 'Create block');

        // Remove the selected gates from the circuit (they're now inside the block)
        const selectedSet = new Set(circuit.selectedGateIds);
        const newGates = circuit.gates.filter((g) => !selectedSet.has(g.id));
        const newWires = circuit.wires.filter(
          (w) => !selectedSet.has(w.fromGateId) && !selectedSet.has(w.toGateId),
        );

        skipHistoryRef.current = true;
        setCircuit({
          ...circuit,
          gates: newGates,
          wires: newWires,
          selectedGateIds: [],
          selectedElementId: null,
        });
      }

      setCreateDialogVisible(false);
    },
    [circuit, blocks, history],
  );

  // ---------------------------------------------------------------
  // Block editing mode
  // ---------------------------------------------------------------

  const handleEnterEditMode = useCallback(
    (blockId: ElementId) => {
      const blockDef = blocks.getBlock(blockId);
      if (!blockDef) return;

      // Find the gate instance in the circuit
      const gateInstance = circuit.gates.find((g) => g.blockId === blockId);
      if (!gateInstance) return;

      // Expand the block to its internal gates+wires
      const expanded = expandBlockInstance(blockDef, gateInstance.position);

      const editingState: CircuitState = {
        gates: expanded.gates,
        wires: expanded.wires,
        selectedElementId: null,
        selectedGateIds: [],
      };

      setPreEditCircuit(circuit);
      setEditingBlockId(blockId);
      setEditingCircuit(editingState);
      showToast(`Editing block: ${blockDef.name}`);
    },
    [circuit, blocks],
  );

  const handleExitEditMode = useCallback(
    (saveChanges: boolean) => {
      if (!editingBlockId || !editingCircuit) return;

      if (saveChanges) {
        // Save the edited internal circuit back to the block definition
        const blockDef = blocks.getBlock(editingBlockId);
        if (blockDef) {
          // Re-compute relative positions
          let minX = Infinity;
          let minY = Infinity;
          for (const gate of editingCircuit.gates) {
            if (gate.position.x < minX) minX = gate.position.x;
            if (gate.position.y < minY) minY = gate.position.y;
          }

          const updatedDef: CustomBlockDefinition = {
            ...blockDef,
            internalGates: editingCircuit.gates.map((g) => ({
              ...g,
              position: {
                x: g.position.x - minX,
                y: g.position.y - minY,
              },
            })),
            internalWires: editingCircuit.wires,
            timestamp: Date.now(),
          };

          // Re-compute port mappings for gates that still exist
          const gateIdSet = new Set(editingCircuit.gates.map((g) => g.id));
          updatedDef.inputPorts = blockDef.inputPorts.filter((p) =>
            gateIdSet.has(p.internalGateId),
          );
          updatedDef.outputPorts = blockDef.outputPorts.filter((p) =>
            gateIdSet.has(p.internalGateId),
          );

          blocks.updateBlock(updatedDef);
          showToast(`Saved changes to: ${blockDef.name}`);
        }
      }

      // Restore the pre-edit circuit
      if (preEditCircuit) {
        setCircuit(preEditCircuit);
      }

      setEditingBlockId(null);
      setEditingCircuit(null);
      setPreEditCircuit(null);
    },
    [editingBlockId, editingCircuit, preEditCircuit, blocks],
  );

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Simulation controls - hidden during block editing */}
      {!editingBlockId && (
        <SimulationControls
          mode={simulation.mode}
          speed={simulation.speed}
          tick={simulation.tick}
          onStart={start}
          onPause={pause}
          onResume={resume}
          onStep={step}
          onReset={reset}
          onSpeedChange={setSpeed}
        />
      )}

      {/* Block editor toolbar (shown during edit mode) */}
      {editingBlockId && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 100,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            background: 'rgba(42, 30, 10, 0.92)',
            borderRadius: 8,
            padding: '6px 12px',
            border: '1px solid #a85d00',
            backdropFilter: 'blur(6px)',
            userSelect: 'none',
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontFamily: 'monospace',
              fontWeight: 'bold',
              color: '#ffb347',
            }}
          >
            EDITING: {blocks.getBlock(editingBlockId)?.name ?? 'Block'}
          </span>
          <button
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontFamily: 'monospace',
              background: '#2a5a00',
              color: '#7cfc00',
              border: '1px solid #7cfc00',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            onClick={() => handleExitEditMode(true)}
          >
            Save & Exit
          </button>
          <button
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontFamily: 'monospace',
              background: '#5a1a1a',
              color: '#ff6b6b',
              border: '1px solid #ff6b6b',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            onClick={() => handleExitEditMode(false)}
          >
            Discard
          </button>
        </div>
      )}

      {/* "Create Block" toolbar button (shown when gates selected, not in edit mode) */}
      {!editingBlockId && circuit.selectedGateIds.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
          }}
        >
          <button
            style={{
              padding: '6px 14px',
              fontSize: 11,
              fontFamily: 'monospace',
              background: 'rgba(22, 33, 62, 0.92)',
              color: '#53a8b6',
              border: '1px solid #53a8b6',
              borderRadius: 6,
              cursor: 'pointer',
              backdropFilter: 'blur(6px)',
              userSelect: 'none',
            }}
            onClick={handleCreateBlockRequest}
          >
            Create Block ({circuit.selectedGateIds.length} gates)
          </button>
        </div>
      )}

      {/* Canvas */}
      <CanvasEditor
        circuit={activeCircuit}
        viewport={viewport}
        onViewportChange={handleViewportChange}
        onCircuitChange={handleCircuitChange}
        customBlocks={blocks.customBlocks}
        onCreateBlockRequest={handleCreateBlockRequest}
        editingBlockId={editingBlockId}
        onEnterEditMode={handleEnterEditMode}
        gridSnapEnabled={gridSnapEnabled}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        simulationSpeed={simulation.speed}
        simulationRunning={simulation.mode === 'running'}
        pendingGateType={pendingGateType}
        pendingBlockId={pendingBlockId}
        onPlaceGate={handlePlaceGate}
        onPlaceBlock={handlePlaceBlock}
        onCancelPlacement={handleCancelPlacement}
      />

      {/* Bottom toolbar: zoom, grid, undo/redo, help */}
      {!editingBlockId && (
        <Toolbar
          viewport={viewport}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetView={handleResetView}
          onFitAll={handleFitAll}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          undoLabel={history.undoLabel}
          redoLabel={history.redoLabel}
          onUndo={handleUndo}
          onRedo={handleRedo}
          gridSnapEnabled={gridSnapEnabled}
          onToggleGridSnap={handleToggleGridSnap}
        />
      )}

      {/* Block library palette */}
      {!editingBlockId && (
        <BlockLibrary
          customBlocks={blocks.customBlocks}
          onDeleteBlock={blocks.deleteBlock}
          onDragBlock={() => {
            // No-op: drag is handled by HTML5 drag API
          }}
          onSelectGateForPlacement={handleSelectGateForPlacement}
          onSelectBlockForPlacement={handleSelectBlockForPlacement}
          selectedGateType={pendingGateType}
          selectedBlockId={pendingBlockId}
        />
      )}

      {/* Create Block Dialog */}
      <CreateBlockDialog
        visible={createDialogVisible}
        inputCount={createDialogInputCount}
        outputCount={createDialogOutputCount}
        onCreate={handleCreateBlock}
        onCancel={() => setCreateDialogVisible(false)}
      />

      {/* Status bar */}
      {!editingBlockId && (
        <StatusBar
          viewport={viewport}
          gridSnapEnabled={gridSnapEnabled}
          simulationMode={simulation.mode}
          simulationSpeed={simulation.speed}
          simulationTick={simulation.tick}
          selectionCount={circuit.selectedGateIds.length}
          gateCount={circuit.gates.length}
          wireCount={circuit.wires.length}
        />
      )}

      <Toast />
    </div>
  );
}
