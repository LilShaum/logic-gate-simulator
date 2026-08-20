import { useEffect, useRef, useCallback, useState } from 'react';
import type {
  CircuitState,
  CustomBlockDefinition,
  ElementId,
  Gate,
  Viewport,
  Position,
} from '@/types/circuit';
import { getGateConfig } from '@/utils/gateConfigs';
import {
  drawGateSymbol,
  getPortWorldPosition,
  isPointInGate,
  isPointNearPort,
  GATE_COLORS,
} from './gates';
import { drawWireOnCanvas, drawPreviewWire } from './wires';
import {
  validateConnection,
  createWire,
  findWireAtPoint,
  getPreviewWirePoints,
} from '@/utils/wireUtils';
import { toggleInputGate } from '@/utils/simulation';
import { getGatesInMarquee } from '@/utils/selectionUtils';
import {
  getBlockGateConfig,
  createBlockInstance,
  isBlockInstance,
} from '@/utils/blockUtils';
import { generateId } from '@/utils/generateId';
import { useSelection } from '@/hooks/useSelection';
import { useClipboard } from '@/hooks/useClipboard';
import { showToast } from '@/utils/toastService';

// ---------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------
const COLORS = {
  background: '#1a1a2e',
  grid: '#252545',
  gridMajor: '#2e2e5a',
  viewportInfo: '#8888aa',
  marqueeFill: 'rgba(83, 168, 182, 0.08)',
  marqueeStroke: '#53a8b6',
  blockBody: '#1a2744',
  blockBorder: '#2a5a8a',
  blockBorderSelected: '#e94560',
  blockBorderHover: '#53a8b6',
  blockText: '#c8d8e8',
  blockIcon: '#7ec8e3',
};

// ---------------------------------------------------------------
// Grid drawing
// ---------------------------------------------------------------

const drawGrid = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  vp: Viewport,
) => {
  const step = 40 * vp.zoom;
  const startX = vp.offsetX % step;
  const startY = vp.offsetY % step;

  // minor grid
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let x = startX; x < w; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = startY; y < h; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // major grid
  const majorStep = step * 5;
  const majorStartX = vp.offsetX % majorStep;
  const majorStartY = vp.offsetY % majorStep;
  ctx.strokeStyle = COLORS.gridMajor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = majorStartX; x < w; x += majorStep) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = majorStartY; y < h; y += majorStep) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
};

// ---------------------------------------------------------------
// Marquee box drawing
// ---------------------------------------------------------------

const drawMarqueeBox = (
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
) => {
  const x = Math.min(sx, ex);
  const y = Math.min(sy, ey);
  const w = Math.abs(ex - sx);
  const h = Math.abs(ey - sy);

  ctx.fillStyle = COLORS.marqueeFill;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = COLORS.marqueeStroke;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 3]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
};

// ---------------------------------------------------------------
// Draw custom block instance on canvas
// ---------------------------------------------------------------

const drawBlockInstance = (
  ctx: CanvasRenderingContext2D,
  gate: Gate,
  blockDef: CustomBlockDefinition,
  vp: Viewport,
  selected: boolean,
  hovered: boolean,
  inputStates: boolean[],
) => {
  const config = getBlockGateConfig(blockDef);
  const x = gate.position.x * vp.zoom + vp.offsetX;
  const y = gate.position.y * vp.zoom + vp.offsetY;
  const w = config.width * vp.zoom;
  const h = config.height * vp.zoom;

  // Body
  ctx.fillStyle = COLORS.blockBody;
  if (selected) {
    ctx.strokeStyle = COLORS.blockBorderSelected;
    ctx.lineWidth = 2.5;
  } else if (hovered) {
    ctx.strokeStyle = COLORS.blockBorderHover;
    ctx.lineWidth = 2;
  } else {
    ctx.strokeStyle = COLORS.blockBorder;
    ctx.lineWidth = 1.5;
  }

  // Rounded rectangle body
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8 * vp.zoom);
  ctx.fill();
  ctx.stroke();

  // Icon
  ctx.font = `${14 * vp.zoom}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.blockIcon;
  ctx.fillText(blockDef.icon, x + w * 0.25, y + h * 0.35);

  // Name
  ctx.fillStyle = COLORS.blockText;
  ctx.font = `bold ${10 * vp.zoom}px monospace`;
  ctx.fillText(
    blockDef.name.length > 10 ? blockDef.name.slice(0, 9) + '…' : blockDef.name,
    x + w * 0.65,
    y + h * 0.35,
  );

  // Port labels
  ctx.font = `${8 * vp.zoom}px monospace`;
  ctx.fillStyle = '#8888aa';

  // Input port labels (left side)
  config.inputs.forEach((port) => {
    const px = (gate.position.x + port.offset.x) * vp.zoom + vp.offsetX;
    const py = (gate.position.y + port.offset.y) * vp.zoom + vp.offsetY;
    ctx.textAlign = 'left';
    ctx.fillText(port.name, px + 8 * vp.zoom, py);
  });

  // Output port labels (right side)
  config.outputs.forEach((port) => {
    const px = (gate.position.x + port.offset.x) * vp.zoom + vp.offsetX;
    const py = (gate.position.y + port.offset.y) * vp.zoom + vp.offsetY;
    ctx.textAlign = 'right';
    ctx.fillText(port.name, px - 8 * vp.zoom, py);
  });

  // Draw port dots
  config.inputs.forEach((_port, i) => {
    const pos = getPortWorldPosition(
      { ...gate, type: 'AND' as Gate['type'] },
      config,
      i,
      true,
    );
    const cx = pos.x * vp.zoom + vp.offsetX;
    const cy = pos.y * vp.zoom + vp.offsetY;
    const r = 4 * vp.zoom;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = inputStates[i] ? GATE_COLORS.portActive : GATE_COLORS.portDot;
    ctx.fill();
    ctx.strokeStyle = '#0a0a1a';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  config.outputs.forEach((_outputPort, i) => {
    const pos = getPortWorldPosition(
      { ...gate, type: 'AND' as Gate['type'] },
      config,
      i,
      false,
    );
    const cx = pos.x * vp.zoom + vp.offsetX;
    const cy = pos.y * vp.zoom + vp.offsetY;
    const r = 4 * vp.zoom;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = gate.outputState ? GATE_COLORS.portActive : GATE_COLORS.portDot;
    ctx.fill();
    ctx.strokeStyle = '#0a0a1a';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
};

// ---------------------------------------------------------------
// Connection mode state
// ---------------------------------------------------------------

interface ConnectingState {
  fromGateId: string;
  fromPortIndex: number;
  mouseWorld: Position;
  valid: boolean;
}

// ---------------------------------------------------------------
// Context menu item component
// ---------------------------------------------------------------

const ContextMenuItem: React.FC<{
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
  separator?: boolean;
}> = ({ label, shortcut, disabled, onClick, separator }) => (
  <>
    {separator && (
      <div
        style={{
          height: 1,
          background: '#0f3460',
          margin: '3px 0',
        }}
      />
    )}
    <div
      style={{
        padding: '6px 12px',
        fontSize: 12,
        fontFamily: 'monospace',
        color: disabled ? '#555' : '#eaeaea',
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        gap: 16,
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLDivElement).style.background = '#0f3460';
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
    >
      <span>{label}</span>
      {shortcut && (
        <span style={{ color: '#8888aa', fontSize: 11 }}>{shortcut}</span>
      )}
    </div>
  </>
);

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

interface CanvasEditorProps {
  circuit: CircuitState;
  viewport: Viewport;
  onViewportChange: (vp: Viewport) => void;
  onCircuitChange?: (circuit: CircuitState) => void;
  /** All custom block definitions for rendering block instances */
  customBlocks?: CustomBlockDefinition[];
  /** Called when user clicks "Create Block" with a valid selection */
  onCreateBlockRequest?: () => void;
  /** Whether we're in block edit mode */
  editingBlockId?: ElementId | null;
  /** Called when user double-clicks a block instance to enter edit mode */
  onEnterEditMode?: (blockId: ElementId) => void;
  /** Whether snap-to-grid is enabled (20px grid) */
  gridSnapEnabled?: boolean;
  /** Called when a gate drag operation starts (for history batching) */
  onDragStart?: () => void;
  /** Called when a gate drag operation ends (for history batching) */
  onDragEnd?: () => void;
}

/** Hit result describes what is under the mouse cursor */
interface HitResult {
  type: 'gate' | 'port' | 'wire';
  gateId?: string;
  portIndex?: number;
  isInput?: boolean;
  wireId?: string;
}

export const CanvasEditor: React.FC<CanvasEditorProps> = ({
  circuit,
  viewport,
  onViewportChange,
  onCircuitChange,
  customBlocks = [],
  onCreateBlockRequest,
  editingBlockId = null,
  onEnterEditMode,
  gridSnapEnabled = false,
  onDragStart,
  onDragEnd,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredGateId, setHoveredGateId] = useState<string | null>(null);
  const [hoveredWireId, setHoveredWireId] = useState<string | null>(null);
  const connectingRef = useRef<ConnectingState | null>(null);
  const [, forceRender] = useState(0);

  // Selection hook
  const selection = useSelection();

  // Clipboard hook
  const clipboard = useClipboard();

  // Space key tracking for Space+drag panning
  const spaceHeldRef = useRef(false);

  // Refs for drag callbacks (used by global mouseup handler)
  const onDragStartRef = useRef(onDragStart);
  const onDragEndRef = useRef(onDragEnd);
  onDragStartRef.current = onDragStart;
  onDragEndRef.current = onDragEnd;

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    pasteWorldPos: Position;
  }>({ visible: false, x: 0, y: 0, pasteWorldPos: { x: 0, y: 0 } });

  // Grid snap helper
  const GRID_SIZE = 20;
  const snapToGrid = useCallback(
    (pos: Position): Position => {
      if (!gridSnapEnabled) return pos;
      return {
        x: Math.round(pos.x / GRID_SIZE) * GRID_SIZE,
        y: Math.round(pos.y / GRID_SIZE) * GRID_SIZE,
      };
    },
    [gridSnapEnabled],
  );

  // Space key tracking for Space+drag panning
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        spaceHeldRef.current = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false;
        // If panning ends because space was released, stop panning
        if (panRef.current?.active) {
          panRef.current = null;
        }
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Drag state
  const dragRef = useRef<{
    active: boolean;
    primaryGateId: string;
    startMouseX: number;
    startMouseY: number;
    isMultiDrag: boolean;
  } | null>(null);

  // Pan state
  const panRef = useRef<{
    active: boolean;
    lastX: number;
    lastY: number;
  } | null>(null);

  // Marquee drag state
  const marqueeDragRef = useRef<{
    active: boolean;
    startSX: number;
    startSY: number;
  } | null>(null);

  // Block lookup map
  const blockMap = useRef<Map<ElementId, CustomBlockDefinition>>(new Map());
  useEffect(() => {
    const map = new Map<ElementId, CustomBlockDefinition>();
    for (const b of customBlocks) {
      map.set(b.id, b);
    }
    blockMap.current = map;
  }, [customBlocks]);

  // Convert screen coords to world coords
  const screenToWorld = useCallback(
    (sx: number, sy: number): Position => {
      return {
        x: (sx - viewport.offsetX) / viewport.zoom,
        y: (sy - viewport.offsetY) / viewport.zoom,
      };
    },
    [viewport],
  );

  // Get GateConfig for any gate (handles block instances)
  const resolveGateConfig = useCallback(
    (gate: Gate) => {
      if (isBlockInstance(gate) && gate.blockId) {
        const blockDef = blockMap.current.get(gate.blockId);
        if (blockDef) {
          return getBlockGateConfig(blockDef);
        }
      }
      return getGateConfig(gate.type);
    },
    [],
  );

  // Hit test
  const hitTest = useCallback(
    (sx: number, sy: number): HitResult | null => {
      const world = screenToWorld(sx, sy);

      for (let i = circuit.gates.length - 1; i >= 0; i--) {
        const gate = circuit.gates[i];
        const config = resolveGateConfig(gate);

        for (let pi = 0; pi < config.inputs.length; pi++) {
          if (isPointNearPort(world.x, world.y, gate, config, pi, true, viewport.zoom)) {
            return { type: 'port', gateId: gate.id, portIndex: pi, isInput: true };
          }
        }
        for (let pi = 0; pi < config.outputs.length; pi++) {
          if (isPointNearPort(world.x, world.y, gate, config, pi, false, viewport.zoom)) {
            return { type: 'port', gateId: gate.id, portIndex: pi, isInput: false };
          }
        }

        if (isPointInGate(world.x, world.y, gate, config)) {
          return { type: 'gate', gateId: gate.id };
        }
      }

      const wireHit = findWireAtPoint(circuit, sx, sy, viewport, 6);
      if (wireHit) {
        return { type: 'wire', wireId: wireHit.id };
      }

      return null;
    },
    [circuit, screenToWorld, viewport, resolveGateConfig],
  );

  // Resize canvas
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
  }, []);

  // Helper: get the set of gate IDs that should appear "selected"
  const getSelectedGateIds = useCallback((): Set<string> => {
    if (selection.selectedGateIds.length > 0) {
      return new Set(selection.selectedGateIds);
    }
    if (circuit.selectedElementId) {
      const isGate = circuit.gates.some((g) => g.id === circuit.selectedElementId);
      if (isGate) return new Set([circuit.selectedElementId]);
    }
    return new Set<string>();
  }, [selection.selectedGateIds, circuit.selectedElementId, circuit.gates]);

  // ---------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    resize();

    const { width: w, height: h } = canvas;

    // clear
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    // grid
    drawGrid(ctx, w, h, viewport);

    // wires
    circuit.wires.forEach((wire) => {
      drawWireOnCanvas(ctx, wire, circuit.gates, viewport, {
        selected: wire.id === circuit.selectedElementId,
        hovered: wire.id === hoveredWireId,
      });
    });

    // Preview wire during connection mode
    const conn = connectingRef.current;
    if (conn) {
      const fromGate = circuit.gates.find((g) => g.id === conn.fromGateId);
      if (fromGate) {
        const worldPts = getPreviewWirePoints(fromGate, conn.fromPortIndex, conn.mouseWorld);
        const screenPts = worldPts.map((p) => ({
          x: p.x * viewport.zoom + viewport.offsetX,
          y: p.y * viewport.zoom + viewport.offsetY,
        }));
        drawPreviewWire(ctx, screenPts, conn.valid);
      }
    }

    const selectedGateSet = getSelectedGateIds();

    // gates
    circuit.gates.forEach((gate) => {
      const config = resolveGateConfig(gate);

      // Compute input states from connected wires
      let inputStates: boolean[];
      if (
        (gate.type === 'INPUT' || gate.type === 'CONSTANT_HIGH' || gate.type === 'CONSTANT_LOW') &&
        !isBlockInstance(gate)
      ) {
        inputStates = [gate.outputState];
      } else {
        const inputWires = circuit.wires.filter((w) => w.toGateId === gate.id);
        const maxPort = config.inputs.length;
        inputStates = new Array(maxPort).fill(false);
        for (const wire of inputWires) {
          if (wire.toPortIndex < maxPort) {
            inputStates[wire.toPortIndex] = wire.signal;
          }
        }
      }

      // Check if this is a block instance
      if (isBlockInstance(gate) && gate.blockId) {
        const blockDef = blockMap.current.get(gate.blockId);
        if (blockDef) {
          drawBlockInstance(
            ctx,
            gate,
            blockDef,
            viewport,
            selectedGateSet.has(gate.id),
            gate.id === hoveredGateId,
            inputStates,
          );
          return;
        }
      }

      drawGateSymbol({
        ctx,
        gate,
        config,
        vp: viewport,
        selected: selectedGateSet.has(gate.id),
        hovered: gate.id === hoveredGateId,
        inputStates,
      });
    });

    // Draw marquee selection box
    const marquee = selection.marqueeBox;
    if (marquee) {
      drawMarqueeBox(ctx, marquee.startX, marquee.startY, marquee.endX, marquee.endY);
    }

    // viewport info
    ctx.fillStyle = COLORS.viewportInfo;
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const modeLabel = connectingRef.current ? 'MODE: Connecting' : '';
    const editLabel = editingBlockId
      ? `  |  EDITING BLOCK`
      : '';
    const selectionLabel =
      selection.selectedGateIds.length > 0
        ? `  |  Selected: ${selection.selectedGateIds.length}`
        : '';
    ctx.fillText(
      `zoom: ${(viewport.zoom * 100).toFixed(0)}%  |  pan: (${viewport.offsetX.toFixed(0)}, ${viewport.offsetY.toFixed(0)})${modeLabel ? '  |  ' + modeLabel : ''}${editLabel}${selectionLabel}`,
      10,
      h - 24,
    );
  }, [
    circuit,
    viewport,
    resize,
    hoveredGateId,
    hoveredWireId,
    selection.marqueeBox,
    selection.selectedGateIds,
    getSelectedGateIds,
    resolveGateConfig,
    editingBlockId,
  ]);

  // Handle window resize
  useEffect(() => {
    const handler = () => resize();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [resize]);

  // Zoom with mouse wheel
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.min(Math.max(viewport.zoom * delta, 0.2), 5);
      onViewportChange({ ...viewport, zoom: newZoom });
    };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, [viewport, onViewportChange]);

  // Keyboard handlers
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const isCtrl = e.ctrlKey || e.metaKey;

      if (isCtrl && e.key === 'a') {
        e.preventDefault();
        if (onCircuitChange) {
          selection.selectAll(circuit, onCircuitChange);
        }
        return;
      }

      if (isCtrl && e.key === 'c') {
        if (selection.selectedGateIds.length > 0) {
          e.preventDefault();
          const success = clipboard.copy(circuit, selection.selectedGateIds);
          if (success) {
            showToast(`Copied ${selection.selectedGateIds.length} gate(s)`);
          }
        }
        return;
      }

      if (isCtrl && e.key === 'v') {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (canvas) {
          const centerX = canvas.width / 2;
          const centerY = canvas.height / 2;
          const worldCenter = screenToWorld(centerX, centerY);
          const newCircuit = clipboard.paste(circuit, worldCenter);
          if (newCircuit && onCircuitChange) {
            onCircuitChange(newCircuit);
            showToast(`Pasted ${newCircuit.gates.length - circuit.gates.length} gate(s)`);
          } else if (!newCircuit) {
            showToast('Nothing to paste');
          }
        }
        return;
      }

      if (isCtrl && e.key === 'x') {
        if (selection.selectedGateIds.length > 0) {
          e.preventDefault();
          const success = clipboard.copy(circuit, selection.selectedGateIds);
          if (success) {
            showToast(`Cut ${selection.selectedGateIds.length} gate(s)`);
            selection.deleteSelected(circuit, onCircuitChange ?? (() => {}));
          }
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.selectedGateIds.length > 0) {
          e.preventDefault();
          if (onCircuitChange) {
            selection.deleteSelected(circuit, onCircuitChange);
          }
          return;
        }
        if (circuit.selectedElementId) {
          const selectedWire = circuit.wires.find(
            (w) => w.id === circuit.selectedElementId,
          );
          if (selectedWire && onCircuitChange) {
            onCircuitChange({
              ...circuit,
              wires: circuit.wires.filter((w) => w.id !== circuit.selectedElementId),
              selectedElementId: null,
            });
          }
        }
      }

      if (e.key === 'Escape') {
        if (connectingRef.current) {
          connectingRef.current = null;
          forceRender((n) => n + 1);
        }
        if (contextMenu.visible) {
          setContextMenu((prev) => ({ ...prev, visible: false }));
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [circuit, onCircuitChange, selection, clipboard, screenToWorld, contextMenu.visible]);

  // Mouse down handler
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      // Middle mouse button or Alt+Left click or Space+Left → pan
      if (
        e.button === 1 ||
        (e.button === 0 && e.altKey) ||
        (e.button === 0 && spaceHeldRef.current)
      ) {
        panRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
        return;
      }

      // Right-click — show context menu
      if (e.button === 2) {
        if (connectingRef.current) {
          connectingRef.current = null;
          forceRender((n) => n + 1);
        }
        const worldPos = screenToWorld(sx, sy);
        setContextMenu({
          visible: true,
          x: e.clientX,
          y: e.clientY,
          pasteWorldPos: worldPos,
        });
        return;
      }

      // Left click
      if (e.button === 0) {
        if (contextMenu.visible) {
          setContextMenu((prev) => ({ ...prev, visible: false }));
        }

        const hit = hitTest(sx, sy);

        // Connecting mode
        if (connectingRef.current) {
          const conn = connectingRef.current;

          if (hit && hit.type === 'port' && hit.isInput && hit.gateId) {
            const validation = validateConnection(
              circuit,
              conn.fromGateId,
              conn.fromPortIndex,
              hit.gateId,
              hit.portIndex!,
            );

            if (validation.valid) {
              const newWire = createWire(
                conn.fromGateId,
                conn.fromPortIndex,
                hit.gateId,
                hit.portIndex!,
                false,
              );
              connectingRef.current = null;
              if (onCircuitChange) {
                onCircuitChange({
                  ...circuit,
                  wires: [...circuit.wires, newWire],
                  selectedElementId: newWire.id,
                  selectedGateIds: [],
                });
              }
              return;
            }
            connectingRef.current = { ...conn, valid: false };
            forceRender((n) => n + 1);
            return;
          }

          connectingRef.current = null;
          forceRender((n) => n + 1);
          return;
        }

        // Output port → start connecting mode
        if (hit && hit.type === 'port' && !hit.isInput && hit.gateId) {
          connectingRef.current = {
            fromGateId: hit.gateId,
            fromPortIndex: hit.portIndex!,
            mouseWorld: screenToWorld(sx, sy),
            valid: true,
          };
          if (onCircuitChange) {
            onCircuitChange({ ...circuit, selectedElementId: null, selectedGateIds: [] });
          }
          forceRender((n) => n + 1);
          return;
        }

        // Gate click
        if (hit && hit.type === 'gate' && hit.gateId) {
          const gate = circuit.gates.find((g) => g.id === hit.gateId);

          if (gate) {
            if (e.shiftKey) {
              if (onCircuitChange) {
                selection.toggleGateSelection(gate.id, circuit, onCircuitChange);
              }
              return;
            }

            const selectedSet = new Set(selection.selectedGateIds);
            if (selectedSet.size > 1 && selectedSet.has(gate.id)) {
              selection.startDragMove(circuit);
              dragRef.current = {
                active: true,
                primaryGateId: gate.id,
                startMouseX: sx,
                startMouseY: sy,
                isMultiDrag: true,
              };
              onDragStart?.();
              return;
            }

            if (onCircuitChange) {
              selection.selectGate(gate.id, circuit, onCircuitChange);
            }

            selection.startDragMove(circuit);
            dragRef.current = {
              active: true,
              primaryGateId: gate.id,
              startMouseX: sx,
              startMouseY: sy,
              isMultiDrag: false,
            };
            onDragStart?.();
          }
        } else if (hit && hit.type === 'port' && hit.isInput) {
          if (onCircuitChange && hit.gateId) {
            selection.selectGate(hit.gateId, circuit, onCircuitChange);
          }
        } else if (hit && hit.type === 'wire' && hit.wireId) {
          if (onCircuitChange) {
            onCircuitChange({
              ...circuit,
              selectedElementId: hit.wireId ?? null,
              selectedGateIds: [],
            });
          }
        } else {
          if (e.shiftKey) return;

          marqueeDragRef.current = { active: true, startSX: sx, startSY: sy };
          selection.startMarquee(sx, sy);

          if (onCircuitChange) {
            selection.clearSelection(circuit, onCircuitChange);
            onCircuitChange({
              ...circuit,
              selectedGateIds: [],
              selectedElementId: null,
            });
          }
        }
      }
    },
    [circuit, hitTest, onCircuitChange, screenToWorld, selection, contextMenu.visible, onDragStart],
  );

  // Mouse move handler
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (panRef.current?.active) {
        const dx = e.clientX - panRef.current.lastX;
        const dy = e.clientY - panRef.current.lastY;
        panRef.current.lastX = e.clientX;
        panRef.current.lastY = e.clientY;
        onViewportChange({
          ...viewport,
          offsetX: viewport.offsetX + dx,
          offsetY: viewport.offsetY + dy,
        });
        return;
      }

      if (marqueeDragRef.current?.active) {
        selection.updateMarquee(sx, sy);
        forceRender((n) => n + 1);
        return;
      }

      if (dragRef.current?.active) {
        const dx = (sx - dragRef.current.startMouseX) / viewport.zoom;
        const dy = (sy - dragRef.current.startMouseY) / viewport.zoom;
        if (onCircuitChange) {
          selection.moveSelectedGates(dx, dy, circuit, onCircuitChange);
          // Apply grid snap to moved gates' final positions
          if (gridSnapEnabled) {
            const movedIds = new Set(selection.selectedGateIds);
            const snappedGates = circuit.gates.map((g) => {
              if (movedIds.has(g.id)) {
                return { ...g, position: snapToGrid(g.position) };
              }
              return g;
            });
            // Only update if something changed
            const hasChanges = snappedGates.some(
              (g, i) => g.position.x !== circuit.gates[i].position.x || g.position.y !== circuit.gates[i].position.y,
            );
            if (hasChanges) {
              onCircuitChange({ ...circuit, gates: snappedGates });
            }
          }
        }
        return;
      }

      if (connectingRef.current) {
        const world = screenToWorld(sx, sy);
        const conn = connectingRef.current;

        let valid = false;
        const hit = hitTest(sx, sy);
        if (hit && hit.type === 'port' && hit.isInput && hit.gateId) {
          const validation = validateConnection(
            circuit,
            conn.fromGateId,
            conn.fromPortIndex,
            hit.gateId,
            hit.portIndex!,
          );
          valid = validation.valid;
        }

        connectingRef.current = { ...conn, mouseWorld: world, valid };
        forceRender((n) => n + 1);
        return;
      }

      // Hover detection
      const hit = hitTest(sx, sy);
      setHoveredGateId(hit?.type === 'gate' ? (hit.gateId ?? null) : null);
      setHoveredWireId(hit?.type === 'wire' ? (hit.wireId ?? null) : null);

      if (hit) {
        if (hit.type === 'port' && !hit.isInput) {
          canvas.style.cursor = 'crosshair';
        } else if (hit.type === 'port' && hit.isInput) {
          canvas.style.cursor = 'pointer';
        } else if (hit.type === 'gate') {
          canvas.style.cursor = 'grab';
        } else if (hit.type === 'wire') {
          canvas.style.cursor = 'pointer';
        } else {
          canvas.style.cursor = 'default';
        }
      } else {
        canvas.style.cursor = connectingRef.current ? 'crosshair' : 'default';
      }
    },
    [circuit, viewport, hitTest, onViewportChange, onCircuitChange, screenToWorld, selection, gridSnapEnabled, snapToGrid],
  );

  // Mouse up handler
  const handleMouseUp = useCallback(
    () => {
      if (marqueeDragRef.current?.active) {
        marqueeDragRef.current = null;

        const box = selection.marqueeBox;
        if (box) {
          const world1 = screenToWorld(box.startX, box.startY);
          const world2 = screenToWorld(box.endX, box.endY);

          const minSize = 5;
          if (
            Math.abs(box.endX - box.startX) > minSize ||
            Math.abs(box.endY - box.startY) > minSize
          ) {
            const result = getGatesInMarquee(
              circuit.gates,
              world1.x,
              world1.y,
              world2.x,
              world2.y,
            );
            if (onCircuitChange) {
              selection.setMarqueeSelection(result.gateIds, circuit, onCircuitChange);
            }
          } else {
            selection.clearMarquee();
          }
        }
        return;
      }

      if (dragRef.current?.active) {
        dragRef.current = null;
        onDragEnd?.();
      }

      panRef.current = null;
    },
    [circuit, onCircuitChange, screenToWorld, selection, onDragEnd],
  );

  // Double-click handler — toggle INPUT gates OR enter block edit mode
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const hit = hitTest(sx, sy);

      if (hit && hit.type === 'gate' && hit.gateId) {
        const gate = circuit.gates.find((g) => g.id === hit.gateId);
        if (!gate) return;

        // Block instance → enter edit mode
        if (isBlockInstance(gate) && gate.blockId && onEnterEditMode) {
          onEnterEditMode(gate.blockId);
          return;
        }

        // INPUT gate → toggle
        if (gate.type === 'INPUT' && onCircuitChange) {
          const updated = toggleInputGate(circuit, gate.id);
          onCircuitChange({ ...updated, selectedGateIds: circuit.selectedGateIds });
        }
      }
    },
    [circuit, hitTest, onCircuitChange, onEnterEditMode],
  );

  // ---------------------------------------------------------------
  // Drag-drop from BlockLibrary / GatePalette
  // ---------------------------------------------------------------

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const rawWorldPos = screenToWorld(sx, sy);
      const worldPos = snapToGrid(rawWorldPos);

      // Check for standard gate type drop
      const gateTypeData = e.dataTransfer.getData('application/x-gate-type');
      if (gateTypeData) {
        const newGate: Gate = {
          id: generateId(),
          type: gateTypeData as Gate['type'],
          position: worldPos,
          outputState: false,
        };
        if (onCircuitChange) {
          onCircuitChange({
            ...circuit,
            gates: [...circuit.gates, newGate],
            selectedGateIds: [newGate.id],
            selectedElementId: null,
          });
          showToast(`Placed ${gateTypeData} gate`);
        }
        return;
      }

      // Check for custom block drop
      const blockId = e.dataTransfer.getData('application/x-custom-block');
      if (!blockId) return;

      const blockDef = blockMap.current.get(blockId);
      if (!blockDef) return;

      const instance = createBlockInstance(blockId, worldPos);
      if (onCircuitChange) {
        onCircuitChange({
          ...circuit,
          gates: [...circuit.gates, instance],
          selectedGateIds: [instance.id],
          selectedElementId: null,
        });
        showToast(`Placed block: ${blockDef.name}`);
      }
    },
    [circuit, onCircuitChange, screenToWorld, snapToGrid],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // Attach global mouseup
  useEffect(() => {
    const up = () => {
      if (dragRef.current?.active) {
        onDragEndRef.current?.();
      }
      dragRef.current = null;
      panRef.current = null;
      if (marqueeDragRef.current?.active) {
        marqueeDragRef.current = null;
        selection.clearMarquee();
      }
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [selection]);

  return (
    <div
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      />
      {/* Context menu */}
      {contextMenu.visible && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 300,
            background: 'rgba(22, 33, 62, 0.96)',
            border: '1px solid #0f3460',
            borderRadius: 6,
            padding: '4px 0',
            minWidth: 160,
            backdropFilter: 'blur(6px)',
            userSelect: 'none',
          }}
        >
          <ContextMenuItem
            label="Copy"
            shortcut="Ctrl+C"
            disabled={selection.selectedGateIds.length === 0}
            onClick={() => {
              if (selection.selectedGateIds.length > 0) {
                const success = clipboard.copy(circuit, selection.selectedGateIds);
                if (success) {
                  showToast(`Copied ${selection.selectedGateIds.length} gate(s)`);
                }
              }
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
          />
          <ContextMenuItem
            label="Cut"
            shortcut="Ctrl+X"
            disabled={selection.selectedGateIds.length === 0}
            onClick={() => {
              if (selection.selectedGateIds.length > 0) {
                const success = clipboard.copy(circuit, selection.selectedGateIds);
                if (success) {
                  showToast(`Cut ${selection.selectedGateIds.length} gate(s)`);
                  selection.deleteSelected(circuit, onCircuitChange ?? (() => {}));
                }
              }
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
          />
          <ContextMenuItem
            label="Paste"
            shortcut="Ctrl+V"
            disabled={!clipboard.hasClipboard}
            onClick={() => {
              const newCircuit = clipboard.paste(circuit, contextMenu.pasteWorldPos);
              if (newCircuit && onCircuitChange) {
                onCircuitChange(newCircuit);
                showToast(`Pasted ${newCircuit.gates.length - circuit.gates.length} gate(s)`);
              } else if (!newCircuit) {
                showToast('Nothing to paste');
              }
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
          />
          <ContextMenuItem
            label="Create Block..."
            disabled={selection.selectedGateIds.length === 0 || !onCreateBlockRequest}
            separator
            onClick={() => {
              if (onCreateBlockRequest) {
                onCreateBlockRequest();
              }
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
          />
        </div>
      )}
    </div>
  );
};
