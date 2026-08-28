import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CanvasEditor, SimulationControls, Toolbar } from '@/components';
import { BlockLibrary } from '@/components/BlockLibrary';
import { CircuitMenu } from '@/components/CircuitMenu';
import { CreateBlockDialog } from '@/components/CreateBlockDialog';
import { StatusBar } from '@/components/StatusBar';
import { Toast } from '@/components/Toast';
import { TruthTablePanel } from '@/components/TruthTablePanel';
import type {
  CircuitState,
  CustomBlockDefinition,
  ElementId,
  GateType,
  Viewport,
} from '@/types/circuit';
import { useBlocks } from '@/hooks/useBlocks';
import { useHistory } from '@/hooks/useHistory';
import { useSimulation } from '@/hooks/useSimulation';
import { analyzeSelection, createBlockInstance, expandBlockInstance } from '@/utils/blockUtils';
import { circuitSignature } from '@/utils/circuitSignature';
import { createDemoCircuit } from '@/utils/demoCircuit';
import { generateId } from '@/utils/generateId';
import { registerBlocks } from '@/utils/gateConfigs';
import {
  buildDocument,
  downloadDocument,
  importDocumentFromFile,
  loadAutosave,
  loadNamed,
  saveAutosave,
  saveNamed,
} from '@/utils/persistence';
import { showToast } from '@/utils/toastService';
import './styles.css';

const emptyCircuit = (): CircuitState => ({
  gates: [],
  wires: [],
  selectedElementId: null,
  selectedGateIds: [],
});

const initialViewport: Viewport = { offsetX: 0, offsetY: 0, zoom: 1 };
const AUTOSAVE_DELAY = 700;

/** What to open with: whatever was last autosaved, else the demo */
const bootstrap = () => {
  const saved = loadAutosave();
  if (saved && saved.circuit.gates.length > 0) {
    return {
      circuit: saved.circuit,
      blocks: saved.blocks,
      name: saved.name,
      viewport: saved.viewport ?? initialViewport,
    };
  }
  return {
    circuit: createDemoCircuit(),
    blocks: [] as CustomBlockDefinition[],
    name: 'Half adder',
    viewport: initialViewport,
  };
};

export default function App() {
  const boot = useRef(bootstrap()).current;

  const [circuit, setCircuit] = useState<CircuitState>(boot.circuit);
  const [viewport, setViewport] = useState<Viewport>(boot.viewport);
  const [circuitName, setCircuitName] = useState(boot.name);
  const [dirty, setDirty] = useState(false);
  const [showTruthTable, setShowTruthTable] = useState(false);

  const blocks = useBlocks(boot.blocks);
  const history = useHistory();

  // Any module that needs a block instance's geometry reads the registry,
  // so it has to be refreshed before anything renders or hit-tests.
  registerBlocks(blocks.customBlocks);
  useEffect(() => {
    registerBlocks(blocks.customBlocks);
  }, [blocks.customBlocks]);

  const preDragCircuitRef = useRef<CircuitState | null>(null);
  const skipHistoryRef = useRef(false);

  const [gridSnapEnabled, setGridSnapEnabled] = useState(true);
  const [pendingGateType, setPendingGateType] = useState<GateType | null>(null);
  const [pendingBlockId, setPendingBlockId] = useState<ElementId | null>(null);

  const [createDialogVisible, setCreateDialogVisible] = useState(false);
  const [createDialogInputCount, setCreateDialogInputCount] = useState(0);
  const [createDialogOutputCount, setCreateDialogOutputCount] = useState(0);

  const [editingBlockId, setEditingBlockId] = useState<ElementId | null>(null);
  const [editingCircuit, setEditingCircuit] = useState<CircuitState | null>(null);
  const [preEditCircuit, setPreEditCircuit] = useState<CircuitState | null>(null);

  const activeCircuit = editingBlockId && editingCircuit ? editingCircuit : circuit;

  const applyToActive = useCallback(
    (next: CircuitState) => {
      if (editingBlockId) setEditingCircuit(next);
      else setCircuit(next);
    },
    [editingBlockId],
  );

  const { simulation, evaluate, step, start, pause, resume, reset, setSpeed } = useSimulation(
    activeCircuit,
    applyToActive,
    blocks.customBlocks,
  );

  // -------------------------------------------------------------
  // Every edit funnels through here: evaluate first, then commit.
  // That is what makes the circuit live — flip a switch or drop a
  // wire and the result is on screen in the same frame, with no
  // need to press Play.
  // -------------------------------------------------------------
  const handleCircuitChange = useCallback(
    (next: CircuitState) => {
      const evaluated = evaluate(next);

      if (editingBlockId) {
        setEditingCircuit(evaluated);
        return;
      }

      // Selection changes are not edits and must not fill up the undo stack
      const isEdit = circuitSignature(circuit) !== circuitSignature(next);
      if (isEdit && !skipHistoryRef.current) history.pushState(circuit, 'Edit');
      skipHistoryRef.current = false;
      if (isEdit) setDirty(true);
      setCircuit(evaluated);
    },
    [circuit, editingBlockId, evaluate, history],
  );

  // Settle whatever we booted with, so the demo shows real signal colours
  useEffect(() => {
    setCircuit((c) => evaluate(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------
  // Autosave (debounced on structural change)
  // -------------------------------------------------------------
  const signature = circuitSignature(circuit);
  useEffect(() => {
    if (editingBlockId) return;
    const id = window.setTimeout(() => {
      saveAutosave(buildDocument(circuitName, circuit, blocks.customBlocks, viewport));
    }, AUTOSAVE_DELAY);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, circuitName, blocks.customBlocks, editingBlockId]);

  // -------------------------------------------------------------
  // Undo / redo
  // -------------------------------------------------------------
  const handleUndo = useCallback(() => {
    const restored = history.undo();
    if (!restored) return;
    skipHistoryRef.current = true;
    setCircuit(evaluate(restored));
    setDirty(true);
  }, [history, evaluate]);

  const handleRedo = useCallback(() => {
    const restored = history.redo();
    if (!restored) return;
    skipHistoryRef.current = true;
    setCircuit(evaluate(restored));
    setDirty(true);
  }, [history, evaluate]);

  const handleDragStart = useCallback(() => {
    preDragCircuitRef.current = structuredClone(circuit);
  }, [circuit]);

  const handleDragEnd = useCallback(() => {
    if (!preDragCircuitRef.current) return;
    history.pushState(preDragCircuitRef.current, 'Move gate');
    preDragCircuitRef.current = null;
  }, [history]);

  // -------------------------------------------------------------
  // File operations
  // -------------------------------------------------------------
  const currentDocument = useCallback(
    () => buildDocument(circuitName || 'Untitled circuit', circuit, blocks.customBlocks, viewport),
    [circuitName, circuit, blocks.customBlocks, viewport],
  );

  const loadDocument = useCallback(
    (doc: ReturnType<typeof buildDocument>) => {
      blocks.replaceAll(doc.blocks);
      registerBlocks(doc.blocks);
      history.clear();
      setCircuitName(doc.name);
      setCircuit(evaluate(doc.circuit));
      if (doc.viewport) setViewport(doc.viewport);
      setDirty(false);
    },
    [blocks, evaluate, history],
  );

  const handleSave = useCallback(() => {
    const doc = currentDocument();
    if (saveNamed(doc)) {
      saveAutosave(doc);
      setDirty(false);
      showToast(`Saved "${doc.name}"`);
    } else {
      showToast('Could not save — browser storage is unavailable');
    }
  }, [currentDocument]);

  const handleOpen = useCallback(
    (name: string) => {
      const doc = loadNamed(name);
      if (!doc) {
        showToast(`Could not open "${name}"`);
        return;
      }
      loadDocument(doc);
      showToast(`Opened "${doc.name}"`);
    },
    [loadDocument],
  );

  const handleNew = useCallback(() => {
    history.clear();
    setCircuitName('Untitled circuit');
    setCircuit(emptyCircuit());
    setViewport(initialViewport);
    setDirty(false);
    showToast('New circuit');
  }, [history]);

  const handleExport = useCallback(() => {
    downloadDocument(currentDocument());
    showToast('Exported .json');
  }, [currentDocument]);

  const handleImport = useCallback(async () => {
    const doc = await importDocumentFromFile();
    if (!doc) {
      showToast("That file didn't look like a circuit");
      return;
    }
    loadDocument(doc);
    showToast(`Imported "${doc.name}"`);
  }, [loadDocument]);

  // -------------------------------------------------------------
  // Global shortcuts
  // -------------------------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        handleRedo();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      } else if (!mod && e.key.toLowerCase() === 't') {
        setShowTruthTable((v) => !v);
      } else if (e.key === ' ') {
        // Space is the canvas pan modifier; only treat it as play/pause
        // when the canvas is not the thing being held.
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo, handleSave]);

  // -------------------------------------------------------------
  // Viewport
  // -------------------------------------------------------------
  const viewportAnimRef = useRef(0);

  const animateViewportTo = useCallback(
    (target: Partial<Viewport>, duration = 220) => {
      const from = viewport;
      const to: Viewport = {
        zoom: Math.min(Math.max(target.zoom ?? from.zoom, 0.15), 5),
        offsetX: target.offsetX ?? from.offsetX,
        offsetY: target.offsetY ?? from.offsetY,
      };
      if (viewportAnimRef.current) cancelAnimationFrame(viewportAnimRef.current);
      const startTime = performance.now();
      const tick = (now: number) => {
        const t = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        setViewport({
          zoom: from.zoom + (to.zoom - from.zoom) * eased,
          offsetX: from.offsetX + (to.offsetX - from.offsetX) * eased,
          offsetY: from.offsetY + (to.offsetY - from.offsetY) * eased,
        });
        viewportAnimRef.current = t < 1 ? requestAnimationFrame(tick) : 0;
      };
      viewportAnimRef.current = requestAnimationFrame(tick);
    },
    [viewport],
  );

  const handleViewportChange = useCallback((vp: Viewport) => {
    if (viewportAnimRef.current) {
      cancelAnimationFrame(viewportAnimRef.current);
      viewportAnimRef.current = 0;
    }
    setViewport(vp);
  }, []);

  const handleResetView = useCallback(
    () => animateViewportTo({ zoom: 1, offsetX: 0, offsetY: 0 }, 260),
    [animateViewportTo],
  );

  const handleFitAll = useCallback(() => {
    if (activeCircuit.gates.length === 0) {
      handleResetView();
      return;
    }
    const canvas = document.querySelector('canvas');
    const dpr = window.devicePixelRatio || 1;
    const canvasW = (canvas?.width ?? window.innerWidth) / dpr;
    const canvasH = (canvas?.height ?? window.innerHeight) / dpr;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const gate of activeCircuit.gates) {
      minX = Math.min(minX, gate.position.x);
      minY = Math.min(minY, gate.position.y);
      maxX = Math.max(maxX, gate.position.x + 90);
      maxY = Math.max(maxY, gate.position.y + 70);
    }

    const margin = 120;
    const zoom = Math.max(
      0.15,
      Math.min(canvasW / (maxX - minX + margin), canvasH / (maxY - minY + margin), 1.6),
    );
    animateViewportTo(
      {
        zoom,
        offsetX: canvasW / 2 - ((minX + maxX) / 2) * zoom,
        offsetY: canvasH / 2 - ((minY + maxY) / 2) * zoom,
      },
      300,
    );
  }, [activeCircuit.gates, handleResetView, animateViewportTo]);

  // Centre the boot circuit once the canvas has a size
  useEffect(() => {
    const id = window.setTimeout(handleFitAll, 60);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------
  // Placement
  // -------------------------------------------------------------
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
      const newGate = { id: generateId(), type: gateType, position, outputState: false };
      handleCircuitChange({
        ...activeCircuit,
        gates: [...activeCircuit.gates, newGate],
        selectedGateIds: [newGate.id],
        selectedElementId: null,
      });
    },
    [activeCircuit, handleCircuitChange],
  );

  const handlePlaceBlock = useCallback(
    (blockId: ElementId, position: { x: number; y: number }) => {
      const blockDef = blocks.customBlocks.find((b) => b.id === blockId);
      if (!blockDef) return;
      const instance = createBlockInstance(blockId, position);
      handleCircuitChange({
        ...activeCircuit,
        gates: [...activeCircuit.gates, instance],
        selectedGateIds: [instance.id],
        selectedElementId: null,
      });
    },
    [activeCircuit, handleCircuitChange, blocks.customBlocks],
  );

  const handleCancelPlacement = useCallback(() => {
    setPendingGateType(null);
    setPendingBlockId(null);
  }, []);

  // -------------------------------------------------------------
  // Custom blocks
  // -------------------------------------------------------------
  const handleCreateBlockRequest = useCallback(() => {
    const analysis = analyzeSelection(circuit, circuit.selectedGateIds);
    if (!analysis) {
      showToast('Select some gates first');
      return;
    }
    if (analysis.inputGates.length === 0 && analysis.outputGates.length === 0) {
      showToast('A block needs IN and/or OUT pins inside the selection');
      return;
    }
    setCreateDialogInputCount(analysis.inputGates.length);
    setCreateDialogOutputCount(analysis.outputGates.length);
    setCreateDialogVisible(true);
  }, [circuit]);

  const handleCreateBlock = useCallback(
    (name: string, description: string, icon: string) => {
      const blockDef = blocks.createBlock(name, description, icon, circuit, circuit.selectedGateIds);
      if (blockDef) {
        history.pushState(circuit, 'Create block');
        const selected = new Set(circuit.selectedGateIds);
        skipHistoryRef.current = true;
        setCircuit(
          evaluate({
            ...circuit,
            gates: circuit.gates.filter((g) => !selected.has(g.id)),
            wires: circuit.wires.filter(
              (w) => !selected.has(w.fromGateId) && !selected.has(w.toGateId),
            ),
            selectedGateIds: [],
            selectedElementId: null,
          }),
        );
        setDirty(true);
        showToast(`Created block "${blockDef.name}"`);
      }
      setCreateDialogVisible(false);
    },
    [circuit, blocks, history, evaluate],
  );

  const handleEnterEditMode = useCallback(
    (blockId: ElementId) => {
      const blockDef = blocks.getBlock(blockId);
      if (!blockDef) return;
      const gateInstance = circuit.gates.find((g) => g.blockId === blockId);
      if (!gateInstance) return;

      const expanded = expandBlockInstance(blockDef, gateInstance.position);
      setPreEditCircuit(circuit);
      setEditingBlockId(blockId);
      setEditingCircuit({
        gates: expanded.gates,
        wires: expanded.wires,
        selectedElementId: null,
        selectedGateIds: [],
      });
      showToast(`Editing "${blockDef.name}"`);
    },
    [circuit, blocks],
  );

  const handleExitEditMode = useCallback(
    (saveChanges: boolean) => {
      if (!editingBlockId || !editingCircuit) return;

      if (saveChanges) {
        const blockDef = blocks.getBlock(editingBlockId);
        if (blockDef) {
          const minX = Math.min(...editingCircuit.gates.map((g) => g.position.x), 0);
          const minY = Math.min(...editingCircuit.gates.map((g) => g.position.y), 0);
          const gateIds = new Set(editingCircuit.gates.map((g) => g.id));

          blocks.updateBlock({
            ...blockDef,
            internalGates: editingCircuit.gates.map((g) => ({
              ...g,
              position: { x: g.position.x - minX, y: g.position.y - minY },
            })),
            internalWires: editingCircuit.wires,
            inputPorts: blockDef.inputPorts.filter((p) => gateIds.has(p.internalGateId)),
            outputPorts: blockDef.outputPorts.filter((p) => gateIds.has(p.internalGateId)),
            timestamp: Date.now(),
          });
          setDirty(true);
          showToast(`Saved "${blockDef.name}"`);
        }
      }

      if (preEditCircuit) setCircuit(evaluate(preEditCircuit));
      setEditingBlockId(null);
      setEditingCircuit(null);
      setPreEditCircuit(null);
    },
    [editingBlockId, editingCircuit, preEditCircuit, blocks, evaluate],
  );

  const selectionCount = activeCircuit.selectedGateIds.length;
  const canvasProps = useMemo(
    () => ({
      customBlocks: blocks.customBlocks,
      gridSnapEnabled,
      pendingGateType,
      pendingBlockId,
    }),
    [blocks.customBlocks, gridSnapEnabled, pendingGateType, pendingBlockId],
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
      {!editingBlockId && (
        <SimulationControls
          mode={simulation.mode}
          speed={simulation.speed}
          tick={simulation.tick}
          oscillating={simulation.oscillating}
          onStart={start}
          onPause={pause}
          onResume={resume}
          onStep={step}
          onReset={reset}
          onSpeedChange={setSpeed}
        />
      )}

      {!editingBlockId && (
        <CircuitMenu
          name={circuitName}
          dirty={dirty}
          onRename={(n) => {
            setCircuitName(n);
            setDirty(true);
          }}
          onNew={handleNew}
          onSave={handleSave}
          onOpen={handleOpen}
          onExport={handleExport}
          onImport={handleImport}
        />
      )}

      {editingBlockId && <BlockEditBar name={blocks.getBlock(editingBlockId)?.name} onExit={handleExitEditMode} />}

      {!editingBlockId && selectionCount > 0 && (
        <button
          onClick={handleCreateBlockRequest}
          style={{
            position: 'absolute',
            top: 58,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 120,
            padding: '6px 14px',
            fontSize: 11,
            fontFamily: 'var(--mono)',
            background: 'rgba(88, 182, 255, 0.16)',
            color: '#9fd6ff',
            border: '1px solid #58b6ff',
            borderRadius: 6,
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}
        >
          Create block from {selectionCount} gate{selectionCount === 1 ? '' : 's'}
        </button>
      )}

      <CanvasEditor
        circuit={activeCircuit}
        viewport={viewport}
        onViewportChange={handleViewportChange}
        onCircuitChange={handleCircuitChange}
        customBlocks={canvasProps.customBlocks}
        onCreateBlockRequest={handleCreateBlockRequest}
        editingBlockId={editingBlockId}
        onEnterEditMode={handleEnterEditMode}
        gridSnapEnabled={canvasProps.gridSnapEnabled}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        simulationSpeed={simulation.speed}
        simulationRunning={simulation.mode === 'running'}
        pendingGateType={canvasProps.pendingGateType}
        pendingBlockId={canvasProps.pendingBlockId}
        onPlaceGate={handlePlaceGate}
        onPlaceBlock={handlePlaceBlock}
        onCancelPlacement={handleCancelPlacement}
      />

      {!editingBlockId && (
        <Toolbar
          viewport={viewport}
          onZoomIn={() => animateViewportTo({ zoom: viewport.zoom * 1.2 })}
          onZoomOut={() => animateViewportTo({ zoom: viewport.zoom * 0.8 })}
          onResetView={handleResetView}
          onFitAll={handleFitAll}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          undoLabel={history.undoLabel}
          redoLabel={history.redoLabel}
          onUndo={handleUndo}
          onRedo={handleRedo}
          gridSnapEnabled={gridSnapEnabled}
          onToggleGridSnap={() => setGridSnapEnabled((v) => !v)}
          truthTableOpen={showTruthTable}
          onToggleTruthTable={() => setShowTruthTable((v) => !v)}
        />
      )}

      {!editingBlockId && (
        <BlockLibrary
          customBlocks={blocks.customBlocks}
          onDeleteBlock={blocks.deleteBlock}
          onDragBlock={() => {}}
          onSelectGateForPlacement={handleSelectGateForPlacement}
          onSelectBlockForPlacement={handleSelectBlockForPlacement}
          selectedGateType={pendingGateType}
          selectedBlockId={pendingBlockId}
        />
      )}

      <TruthTablePanel
        visible={showTruthTable && !editingBlockId}
        circuit={activeCircuit}
        blocks={blocks.customBlocks}
        onClose={() => setShowTruthTable(false)}
      />

      <CreateBlockDialog
        visible={createDialogVisible}
        inputCount={createDialogInputCount}
        outputCount={createDialogOutputCount}
        onCreate={handleCreateBlock}
        onCancel={() => setCreateDialogVisible(false)}
      />

      {!editingBlockId && (
        <StatusBar
          viewport={viewport}
          gridSnapEnabled={gridSnapEnabled}
          simulationMode={simulation.mode}
          simulationSpeed={simulation.speed}
          simulationTick={simulation.tick}
          selectionCount={selectionCount}
          gateCount={activeCircuit.gates.length}
          wireCount={activeCircuit.wires.length}
          oscillating={simulation.oscillating}
        />
      )}

      <Toast />
    </div>
  );
}

// ---------------------------------------------------------------

const BlockEditBar: React.FC<{ name?: string; onExit: (save: boolean) => void }> = ({
  name,
  onExit,
}) => (
  <div
    style={{
      position: 'absolute',
      top: 12,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 130,
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      background: 'rgba(42, 30, 10, 0.92)',
      borderRadius: 8,
      padding: '6px 12px',
      border: '1px solid #a85d00',
      backdropFilter: 'blur(8px)',
      userSelect: 'none',
    }}
  >
    <span style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600, color: '#ffb454' }}>
      EDITING: {name ?? 'Block'}
    </span>
    <button
      style={{
        padding: '4px 10px',
        fontSize: 11,
        fontFamily: 'var(--mono)',
        background: 'rgba(61,220,151,0.15)',
        color: '#3ddc97',
        border: '1px solid #3ddc97',
        borderRadius: 4,
        cursor: 'pointer',
      }}
      onClick={() => onExit(true)}
    >
      Save &amp; exit
    </button>
    <button
      style={{
        padding: '4px 10px',
        fontSize: 11,
        fontFamily: 'var(--mono)',
        background: 'rgba(255,107,107,0.12)',
        color: '#ff6b6b',
        border: '1px solid #ff6b6b',
        borderRadius: 4,
        cursor: 'pointer',
      }}
      onClick={() => onExit(false)}
    >
      Discard
    </button>
  </div>
);
