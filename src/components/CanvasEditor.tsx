import { useEffect, useRef, useCallback, useState } from 'react';
import type {
  CircuitState,
  CustomBlockDefinition,
  ElementId,
  Gate,
  GateType,
  Viewport,
  Position,
  SimulationSpeed,
} from '@/types/circuit';
import { getGateConfig } from '@/utils/gateConfigs';
import {
  drawGateSymbol,
  getPortWorldPosition,
  isPointInGate,
  isPointNearPort,
  GATE_COLORS,
} from './gates';
import {
  drawWireOnCanvas,
  drawPreviewWire,
  drawSnapFeedback,
  drawWireJunctions,
  detectWireJunctions,
  getWireTooltipInfo,
} from './wires';
import type { WireTooltipInfo } from './wires';
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
import { ContextMenu } from './ContextMenu';
import type { ContextMenuItem } from './ContextMenu';
import {
  computeAlignmentSnap,
  getSelectionBBox,
  distributeHorizontally,
  distributeVertically,
  alignGates,
} from '@/utils/alignmentUtils';
import type { AlignmentGuide } from '@/utils/alignmentUtils';

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
// Alignment guide drawing
// ---------------------------------------------------------------

const drawAlignmentGuides = (
  ctx: CanvasRenderingContext2D,
  guides: AlignmentGuide[],
  snapFlashTime: number,
) => {
  if (guides.length === 0) return;

  // Compute flash opacity (bright pulse on snap, then fade)
  const elapsed = performance.now() - snapFlashTime;
  const flashOpacity = elapsed < 300 ? 1.0 - (elapsed / 300) * 0.5 : 0.5;

  ctx.save();
  for (const guide of guides) {
    ctx.strokeStyle = `rgba(233, 69, 96, ${flashOpacity})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(guide.startX, guide.startY);
    ctx.lineTo(guide.endX, guide.endY);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
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
  config.inputs.forEach((port, i) => {
    const px = (gate.position.x + port.offset.x) * vp.zoom + vp.offsetX;
    const py = (gate.position.y + port.offset.y) * vp.zoom + vp.offsetY;
    ctx.textAlign = 'left';
    const label = port.name || String.fromCharCode(65 + i);
    ctx.fillText(label, px + 12 * vp.zoom, py);
  });

  // Output port labels (right side)
  config.outputs.forEach((port) => {
    const px = (gate.position.x + port.offset.x) * vp.zoom + vp.offsetX;
    const py = (gate.position.y + port.offset.y) * vp.zoom + vp.offsetY;
    ctx.textAlign = 'right';
    ctx.fillText(port.name || 'OUT', px - 12 * vp.zoom, py);
  });

  // Draw port dots — input (square-ish) and output (circle)
  config.inputs.forEach((_port, i) => {
    const pos = getPortWorldPosition(
      { ...gate, type: 'AND' as Gate['type'] },
      config,
      i,
      true,
    );
    const cx = pos.x * vp.zoom + vp.offsetX;
    const cy = pos.y * vp.zoom + vp.offsetY;
    const active = inputStates[i] ?? false;

    // Input port: square-ish with rounded corners
    const size = 9 * vp.zoom;

    // Outer ring
    ctx.beginPath();
    ctx.roundRect(cx - size - 1.5 * vp.zoom, cy - size - 1.5 * vp.zoom, (size + 1.5 * vp.zoom) * 2, (size + 1.5 * vp.zoom) * 2, 2 * vp.zoom);
    ctx.fillStyle = '#0a0a1a';
    ctx.fill();

    // Inner square
    ctx.beginPath();
    ctx.roundRect(cx - size, cy - size, size * 2, size * 2, 2 * vp.zoom);
    ctx.fillStyle = active ? GATE_COLORS.portActive : GATE_COLORS.portDot;
    ctx.fill();

    // Subtle inner highlight
    ctx.beginPath();
    ctx.roundRect(cx - size * 0.6, cy - size * 0.6, size * 0.5, size * 0.5, 1 * vp.zoom);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fill();
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
    const r = 5 * vp.zoom;

    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + 1.5 * vp.zoom, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a1a';
    ctx.fill();

    // Inner circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = gate.outputState ? GATE_COLORS.portActive : GATE_COLORS.portDot;
    ctx.fill();

    // Subtle inner highlight
    ctx.beginPath();
    ctx.arc(cx - r * 0.2, cy - r * 0.25, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fill();
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
  /** The nearest snap target during connection (if any) */
  snapTarget?: {
    gateId: string;
    portIndex: number;
    isInput: boolean;
    worldPos: Position;
  };
}

// ---------------------------------------------------------------
// Context menu target — what was right-clicked
// ---------------------------------------------------------------

type ContextMenuTarget =
  | { type: 'canvas' }
  | { type: 'gate'; gateId: ElementId }
  | { type: 'wire'; wireId: ElementId };

// ---------------------------------------------------------------
// Gate descriptions for hover tooltips
// ---------------------------------------------------------------

const GATE_TOOLTIPS: Record<GateType, string> = {
  INPUT: 'User-toggleable input switch',
  OUTPUT: 'LED output indicator',
  CONSTANT_HIGH: 'Fixed HIGH (1) signal',
  CONSTANT_LOW: 'Fixed LOW (0) signal',
  AND: 'Outputs HIGH when all inputs HIGH',
  OR: 'Outputs HIGH when any input HIGH',
  NOT: 'Inverts the input signal',
  NAND: 'AND + NOT (inverted AND)',
  NOR: 'OR + NOT (inverted OR)',
  XOR: 'Outputs HIGH when inputs differ',
  XNOR: 'XOR + NOT (equality gate)',
};

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
  /** Current simulation speed — drives signal flow animation */
  simulationSpeed?: SimulationSpeed;
  /** Whether simulation is currently running */
  simulationRunning?: boolean;
  /** Gate type pending for click-to-place from palette */
  pendingGateType?: GateType | null;
  /** Block ID pending for click-to-place from palette */
  pendingBlockId?: ElementId | null;
  /** Place a standard gate at the given world position */
  onPlaceGate?: (gateType: GateType, position: Position) => void;
  /** Place a custom block at the given world position */
  onPlaceBlock?: (blockId: ElementId, position: Position) => void;
  /** Cancel click-to-place mode */
  onCancelPlacement?: () => void;
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
  simulationSpeed = 'normal',
  simulationRunning = false,
  pendingGateType = null,
  pendingBlockId = null,
  onPlaceGate,
  onPlaceBlock,
  onCancelPlacement,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredGateId, setHoveredGateId] = useState<string | null>(null);
  const [hoveredWireId, setHoveredWireId] = useState<string | null>(null);
  const [hoveredPort, setHoveredPort] = useState<{
    gateId: string;
    portIndex: number;
    isInput: boolean;
    name: string;
    screenX: number;
    screenY: number;
  } | null>(null);
  const connectingRef = useRef<ConnectingState | null>(null);
  const [renderFrame, forceRender] = useState(0);

  // Animation time for signal flow (updated via requestAnimationFrame)
  const animTimeRef = useRef(0);
  const animFrameRef = useRef<number>(0);

  // Wire hover tooltip state
  const [hoveredWireTooltip, setHoveredWireTooltip] = useState<WireTooltipInfo | null>(null);
  const [hoveredWireScreenPos, setHoveredWireScreenPos] = useState<{ x: number; y: number } | null>(null);

  // Click-to-place mode: ghost preview follows the cursor
  const [ghostMouse, setGhostMouse] = useState<{ sx: number; sy: number } | null>(null);
  const placementActive = Boolean(pendingGateType || pendingBlockId);

  // Simulation speed ref for animation loop
  const simSpeedRef = useRef(simulationSpeed);
  const simRunningRef = useRef(simulationRunning);
  useEffect(() => { simSpeedRef.current = simulationSpeed; }, [simulationSpeed]);
  useEffect(() => { simRunningRef.current = simulationRunning; }, [simulationRunning]);

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
    target: ContextMenuTarget;
  }>({ visible: false, x: 0, y: 0, pasteWorldPos: { x: 0, y: 0 }, target: { type: 'canvas' } });

  // Delete confirmation (shown when deleting block instances)
  const [deleteConfirm, setDeleteConfirm] = useState<{ gateCount: number; blockCount: number } | null>(null);

  // Gate hover tooltip
  const [hoveredGateInfo, setHoveredGateInfo] = useState<{
    gateId: string;
    screenX: number;
    screenY: number;
  } | null>(null);

  // Alignment guides during drag
  const alignmentGuidesRef = useRef<AlignmentGuide[]>([]);
  // Snap flash effect timestamp
  const snapFlashRef = useRef<number>(0);

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

  // Helper: compute per-port draw states for connection mode highlights
  const getPortDrawStates = useCallback(
    (gateId: string, config: ReturnType<typeof resolveGateConfig>): {
      inputs?: { hovered?: boolean; highlight?: 'valid' | 'invalid'; snapTarget?: boolean }[];
      outputs?: { hovered?: boolean; highlight?: 'valid' | 'invalid'; snapTarget?: boolean }[];
    } | undefined => {
      const conn = connectingRef.current;
      if (!conn) return undefined;

      const isSource = conn.fromGateId === gateId;
      const snap = conn.snapTarget;
      const isSnapTarget = snap?.gateId === gateId;

      // Input ports: highlight during connection mode
      const inputs = config.inputs.map((_port, i) => {
        const state: { hovered?: boolean; highlight?: 'valid' | 'invalid'; snapTarget?: boolean } = {};

        // If this port is the snap target, show highlight + snap glow
        if (isSnapTarget && snap?.portIndex === i) {
          state.highlight = conn.valid ? 'valid' : 'invalid';
          state.snapTarget = true;
        }

        return state;
      });

      // Output ports: highlight source port
      const outputs = config.outputs.map((_port, i) => {
        const state: { hovered?: boolean; highlight?: 'valid' | 'invalid'; snapTarget?: boolean } = {};

        // If this is the source port, give it a subtle highlight
        if (isSource && conn.fromPortIndex === i) {
          state.highlight = 'valid';
        }

        return state;
      });

      return { inputs, outputs };
    },
    [],
  );

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
      }, {
        time: animTimeRef.current,
        speed: simulationSpeed,
      });
    });

    // Wire junction bridges (where wires cross)
    const junctions = detectWireJunctions(circuit.wires, circuit.gates, viewport);
    drawWireJunctions(ctx, junctions, viewport.zoom);

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

      // Draw animated snap feedback on the snap target port
      if (conn.snapTarget) {
        const snapGate = circuit.gates.find((g) => g.id === conn.snapTarget!.gateId);
        if (snapGate) {
          const snapConfig = resolveGateConfig(snapGate);
          const portPos = getPortWorldPosition(
            snapGate,
            snapConfig,
            conn.snapTarget.portIndex,
            true,
          );
          const cx = portPos.x * viewport.zoom + viewport.offsetX;
          const cy = portPos.y * viewport.zoom + viewport.offsetY;
          drawSnapFeedback(ctx, cx, cy, viewport.zoom, conn.valid, performance.now());
        }
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
        portStates: getPortDrawStates(gate.id, config),
      });
    });

    // Pulsing selection outline (smooth selection animation)
    if (selectedGateSet.size > 0) {
      const pulse = 0.3 + 0.22 * Math.sin(performance.now() / 260);
      ctx.save();
      ctx.strokeStyle = `rgba(233, 69, 96, ${pulse.toFixed(3)})`;
      ctx.lineWidth = 1.5;
      for (const gate of circuit.gates) {
        if (!selectedGateSet.has(gate.id)) continue;
        const gConfig = resolveGateConfig(gate);
        const gx = gate.position.x * viewport.zoom + viewport.offsetX - 4 * viewport.zoom;
        const gy = gate.position.y * viewport.zoom + viewport.offsetY - 4 * viewport.zoom;
        const gw = (gConfig.width + 8) * viewport.zoom;
        const gh = (gConfig.height + 8) * viewport.zoom;
        ctx.beginPath();
        ctx.roundRect(gx, gy, gw, gh, 6 * viewport.zoom);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Ghost preview for click-to-place mode
    if ((pendingGateType || pendingBlockId) && ghostMouse) {
      const world = snapToGrid(screenToWorld(ghostMouse.sx, ghostMouse.sy));
      ctx.save();
      ctx.globalAlpha = 0.55;
      if (pendingGateType) {
        const ghostGate: Gate = {
          id: '__ghost__',
          type: pendingGateType,
          position: world,
          outputState: false,
        };
        drawGateSymbol({
          ctx,
          gate: ghostGate,
          config: getGateConfig(pendingGateType),
          vp: viewport,
          selected: true,
          hovered: false,
          inputStates: [],
        });
      } else if (pendingBlockId) {
        const blockDef = blockMap.current.get(pendingBlockId);
        if (blockDef) {
          const ghostGate: Gate = {
            id: '__ghost__',
            type: 'AND',
            position: world,
            outputState: false,
            blockId: pendingBlockId,
          };
          drawBlockInstance(ctx, ghostGate, blockDef, viewport, true, false, []);
        }
      }
      ctx.restore();
    }

    // Draw marquee selection box
    const marquee = selection.marqueeBox;
    if (marquee) {
      drawMarqueeBox(ctx, marquee.startX, marquee.startY, marquee.endX, marquee.endY);
    }

    // Draw alignment guides during drag
    if (alignmentGuidesRef.current.length > 0) {
      drawAlignmentGuides(ctx, alignmentGuidesRef.current, snapFlashRef.current);
    }

    // Draw port tooltip (HTML overlay rendered in JSX below, but draw a subtle indicator on canvas)
    if (hoveredPort) {
      const portConfig = circuit.gates.find((g) => g.id === hoveredPort.gateId)
        ? resolveGateConfig(circuit.gates.find((g) => g.id === hoveredPort.gateId)!)
        : null;
      if (portConfig) {
        const gate = circuit.gates.find((g) => g.id === hoveredPort.gateId);
        if (gate) {
          const ports = hoveredPort.isInput ? portConfig.inputs : portConfig.outputs;
          const portDef = ports[hoveredPort.portIndex];
          if (portDef) {
            const wpos = getPortWorldPosition(gate, portConfig, hoveredPort.portIndex, hoveredPort.isInput);
            const cx = wpos.x * viewport.zoom + viewport.offsetX;
            const cy = wpos.y * viewport.zoom + viewport.offsetY;

            // Subtle pulsing ring around hovered port
            const pulseR = 12 * viewport.zoom;
            ctx.save();
            ctx.strokeStyle = hoveredPort.isInput ? 'rgba(83, 168, 182, 0.5)' : 'rgba(83, 168, 182, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
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
    hoveredPort,
    selection.marqueeBox,
    selection.selectedGateIds,
    getSelectedGateIds,
    getPortDrawStates,
    resolveGateConfig,
    editingBlockId,
    simulationSpeed,
    pendingGateType,
    pendingBlockId,
    ghostMouse,
    snapToGrid,
    screenToWorld,
    renderFrame,
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
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.min(Math.max(viewport.zoom * delta, 0.2), 5);
      // Keep the world point under the cursor stationary while zooming
      const worldX = (sx - viewport.offsetX) / viewport.zoom;
      const worldY = (sy - viewport.offsetY) / viewport.zoom;
      onViewportChange({
        zoom: newZoom,
        offsetX: sx - worldX * newZoom,
        offsetY: sy - worldY * newZoom,
      });
    };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, [viewport, onViewportChange]);

  // ---------------------------------------------------------------
  // Deletion with confirmation for custom block instances
  // ---------------------------------------------------------------

  const performDeleteSelected = useCallback(() => {
    if (!onCircuitChange) return;
    selection.deleteSelected(circuit, onCircuitChange);
  }, [circuit, onCircuitChange, selection]);

  /** Ask for confirmation when the selection contains block instances */
  const requestDeleteSelected = useCallback(() => {
    if (selection.selectedGateIds.length === 0 || !onCircuitChange) return;
    const selectedSet = new Set(selection.selectedGateIds);
    const blockCount = circuit.gates.filter(
      (g) => selectedSet.has(g.id) && isBlockInstance(g),
    ).length;
    if (blockCount > 0) {
      setDeleteConfirm({
        gateCount: selection.selectedGateIds.length,
        blockCount,
      });
    } else {
      performDeleteSelected();
    }
  }, [circuit, selection, onCircuitChange, performDeleteSelected]);

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
          requestDeleteSelected();
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

      // Arrow key nudging for selected gates
      if (
        (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        selection.selectedGateIds.length > 0 &&
        onCircuitChange
      ) {
        e.preventDefault();
        const nudgeAmount = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        switch (e.key) {
          case 'ArrowUp': dy = -nudgeAmount; break;
          case 'ArrowDown': dy = nudgeAmount; break;
          case 'ArrowLeft': dx = -nudgeAmount; break;
          case 'ArrowRight': dx = nudgeAmount; break;
        }

        // Use drag-move to nudge (store current positions, apply delta, commit)
        selection.startDragMove(circuit);
        selection.moveSelectedGates(dx, dy, circuit, onCircuitChange);
        return;
      }

      if (e.key === 'Escape') {
        if (deleteConfirm) {
          setDeleteConfirm(null);
          return;
        }
        if (placementActive) {
          onCancelPlacement?.();
          return;
        }
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
  }, [circuit, onCircuitChange, selection, clipboard, screenToWorld, contextMenu.visible, placementActive, onCancelPlacement, requestDeleteSelected, deleteConfirm]);

  // Set copy cursor while placement mode is active
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (placementActive) {
      canvas.style.cursor = 'copy';
    } else {
      canvas.style.cursor = 'default';
    }
  }, [placementActive]);

  // ---------------------------------------------------------------
  // Animation loop — updates animTimeRef for signal flow rendering
  // ---------------------------------------------------------------
  useEffect(() => {
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      animTimeRef.current += dt;
      forceRender((n) => n + 1);
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

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

      // Right-click — cancel placement mode, otherwise show context menu
      if (e.button === 2) {
        if (placementActive) {
          onCancelPlacement?.();
          return;
        }
        if (connectingRef.current) {
          connectingRef.current = null;
          forceRender((n) => n + 1);
        }
        const worldPos = screenToWorld(sx, sy);
        const hit = hitTest(sx, sy);

        let target: ContextMenuTarget = { type: 'canvas' };
        if (hit?.type === 'gate' && hit.gateId) {
          // Select the gate unless it's already part of a multi-selection
          if (!selection.selectedGateIds.includes(hit.gateId)) {
            selection.selectGate(hit.gateId, circuit, onCircuitChange ?? (() => {}));
          }
          target = { type: 'gate', gateId: hit.gateId };
        } else if (hit?.type === 'wire' && hit.wireId) {
          if (onCircuitChange) {
            onCircuitChange({
              ...circuit,
              selectedElementId: hit.wireId,
              selectedGateIds: [],
            });
          }
          target = { type: 'wire', wireId: hit.wireId };
        }

        setContextMenu({
          visible: true,
          x: e.clientX,
          y: e.clientY,
          pasteWorldPos: worldPos,
          target,
        });
        return;
      }

      // Left click
      if (e.button === 0) {
        // Click-to-place mode: place the pending gate/block at the clicked position
        if (placementActive) {
          const worldPos = snapToGrid(screenToWorld(sx, sy));
          if (pendingGateType && onPlaceGate) {
            onPlaceGate(pendingGateType, worldPos);
          } else if (pendingBlockId && onPlaceBlock) {
            onPlaceBlock(pendingBlockId, worldPos);
          }
          return;
        }

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
    [circuit, hitTest, onCircuitChange, screenToWorld, selection, contextMenu.visible, onDragStart, placementActive, pendingGateType, pendingBlockId, onPlaceGate, onPlaceBlock, onCancelPlacement, snapToGrid],
  );

  // Mouse move handler
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      // Click-to-place mode: track ghost position, skip hover logic
      if (placementActive) {
        setGhostMouse({ sx, sy });
        canvas.style.cursor = 'copy';
        return;
      }

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

          // Alignment snap: compute snap for the dragged selection
          const movedIds = new Set(selection.selectedGateIds);
          if (movedIds.size > 0) {
            const selectedGates = circuit.gates.filter((g) => movedIds.has(g.id));
            const selBBox = getSelectionBBox(selectedGates, customBlocks);
            if (selBBox) {
              const candidatePos = { x: selBBox.left, y: selBBox.top };
              const canvas = canvasRef.current;
              const cw = canvas?.width ?? 800;
              const ch = canvas?.height ?? 600;

              const snapResult = computeAlignmentSnap(
                candidatePos,
                { width: selBBox.right - selBBox.left, height: selBBox.bottom - selBBox.top },
                circuit.gates,
                movedIds,
                customBlocks,
                cw,
                ch,
                viewport,
              );

              alignmentGuidesRef.current = snapResult.guides;

              // Check if snapping happened (position changed from candidate)
              const snappedX = snapResult.position.x;
              const snappedY = snapResult.position.y;
              if (
                Math.abs(snappedX - candidatePos.x) > 0.1 ||
                Math.abs(snappedY - candidatePos.y) > 0.1
              ) {
                // Apply the alignment snap
                const offsetX = snappedX - candidatePos.x;
                const offsetY = snappedY - candidatePos.y;
                const alignedGates = circuit.gates.map((g) => {
                  if (movedIds.has(g.id)) {
                    return {
                      ...g,
                      position: {
                        x: g.position.x + offsetX,
                        y: g.position.y + offsetY,
                      },
                    };
                  }
                  return g;
                });
                onCircuitChange({ ...circuit, gates: alignedGates });
                // Trigger snap flash
                snapFlashRef.current = performance.now();
              }
            }
          }
        }
        return;
      }

      if (connectingRef.current) {
        const world = screenToWorld(sx, sy);
        const conn = connectingRef.current;

        // Magnetic snap: find nearest input port within 30px (world space)
        const SNAP_RADIUS = 30; // world-space pixels
        let nearestSnap: ConnectingState['snapTarget'] = undefined;
        let nearestDist = SNAP_RADIUS;

        for (const gate of circuit.gates) {
          const config = resolveGateConfig(gate);
          for (let pi = 0; pi < config.inputs.length; pi++) {
            const portPos = getPortWorldPosition(gate, config, pi, true);
            const dx = world.x - portPos.x;
            const dy = world.y - portPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestSnap = {
                gateId: gate.id,
                portIndex: pi,
                isInput: true,
                worldPos: portPos,
              };
            }
          }
        }

        // If snap target found, snap mouse to that port position
        const effectiveWorld = nearestSnap ? nearestSnap.worldPos : world;

        let valid = false;
        // Check snap target validity or test hit against ports
        if (nearestSnap) {
          const validation = validateConnection(
            circuit,
            conn.fromGateId,
            conn.fromPortIndex,
            nearestSnap.gateId,
            nearestSnap.portIndex,
          );
          valid = validation.valid;
        } else {
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
        }

        connectingRef.current = {
          ...conn,
          mouseWorld: effectiveWorld,
          valid,
          snapTarget: nearestSnap ?? undefined,
        };
        forceRender((n) => n + 1);
        return;
      }

      // Hover detection
      const hit = hitTest(sx, sy);
      setHoveredGateId(hit?.type === 'gate' ? (hit.gateId ?? null) : null);
      setHoveredWireId(hit?.type === 'wire' ? (hit.wireId ?? null) : null);

      // Gate hover tooltip (position captured on gate entry)
      if (hit && hit.type === 'gate' && hit.gateId) {
        setHoveredGateInfo((prev) =>
          prev && prev.gateId === hit.gateId
            ? prev
            : { gateId: hit.gateId as string, screenX: sx, screenY: sy },
        );
      } else {
        setHoveredGateInfo(null);
      }

      // Wire hover tooltip
      if (hit && hit.type === 'wire' && hit.wireId) {
        const hoveredWire = circuit.wires.find((w) => w.id === hit.wireId);
        if (hoveredWire) {
          const info = getWireTooltipInfo(hoveredWire, circuit.gates);
          setHoveredWireTooltip(info);
          setHoveredWireScreenPos({ x: sx, y: sy });
        }
      } else {
        setHoveredWireTooltip(null);
        setHoveredWireScreenPos(null);
      }

      // Track hovered port for tooltip
      if (hit && hit.type === 'port' && hit.gateId && hit.portIndex !== undefined) {
        const gate = circuit.gates.find((g) => g.id === hit.gateId);
        if (gate) {
          const config = resolveGateConfig(gate);
          const ports = hit.isInput ? config.inputs : config.outputs;
          const port = ports[hit.portIndex];
          if (port) {
            setHoveredPort({
              gateId: hit.gateId,
              portIndex: hit.portIndex,
              isInput: hit.isInput ?? false,
              name: port.name,
              screenX: sx,
              screenY: sy,
            });
          }
        }
      } else {
        setHoveredPort(null);
      }

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
    [circuit, viewport, hitTest, onViewportChange, onCircuitChange, screenToWorld, selection, gridSnapEnabled, snapToGrid, resolveGateConfig, customBlocks, placementActive],
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
      alignmentGuidesRef.current = [];
      if (marqueeDragRef.current?.active) {
        marqueeDragRef.current = null;
        selection.clearMarquee();
      }
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [selection]);

  // ---------------------------------------------------------------
  // Context-aware menu items based on right-click target
  // ---------------------------------------------------------------

  const closeContextMenu = () =>
    setContextMenu((prev) => ({ ...prev, visible: false }));

  const copySelection = () => {
    if (selection.selectedGateIds.length === 0) return;
    const success = clipboard.copy(circuit, selection.selectedGateIds);
    if (success) {
      showToast(`Copied ${selection.selectedGateIds.length} gate(s)`);
    }
  };

  const cutSelection = () => {
    if (selection.selectedGateIds.length === 0 || !onCircuitChange) return;
    const success = clipboard.copy(circuit, selection.selectedGateIds);
    if (success) {
      showToast(`Cut ${selection.selectedGateIds.length} gate(s)`);
      selection.deleteSelected(circuit, onCircuitChange);
    }
  };

  const pasteAt = (pos: Position) => {
    if (!onCircuitChange) return;
    const newCircuit = clipboard.paste(circuit, pos);
    if (newCircuit) {
      onCircuitChange(newCircuit);
      showToast(`Pasted ${newCircuit.gates.length - circuit.gates.length} gate(s)`);
    } else {
      showToast('Nothing to paste');
    }
  };

  const duplicateSelection = () => {
    if (selection.selectedGateIds.length === 0 || !onCircuitChange) return;
    const success = clipboard.copy(circuit, selection.selectedGateIds);
    if (!success) return;
    const selectedGates = circuit.gates.filter((g) =>
      selection.selectedGateIds.includes(g.id),
    );
    const bbox = getSelectionBBox(selectedGates, customBlocks);
    const center = bbox
      ? { x: (bbox.left + bbox.right) / 2 + 30, y: (bbox.top + bbox.bottom) / 2 + 30 }
      : { x: 120, y: 120 };
    const newCircuit = clipboard.paste(circuit, center);
    if (newCircuit) {
      onCircuitChange(newCircuit);
      showToast(`Duplicated ${selection.selectedGateIds.length} gate(s)`);
    }
  };

  const applyAlign = (
    mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom',
  ) => {
    if (!onCircuitChange) return;
    const selectedGates = circuit.gates.filter((g) =>
      selection.selectedGateIds.includes(g.id),
    );
    const aligned = alignGates(selectedGates, mode, customBlocks);
    const gateMap = new Map(aligned.map((g) => [g.id, g]));
    onCircuitChange({
      ...circuit,
      gates: circuit.gates.map((g) => gateMap.get(g.id) ?? g),
    });
  };

  const applyDistribute = (axis: 'h' | 'v') => {
    if (!onCircuitChange) return;
    const selectedGates = circuit.gates.filter((g) =>
      selection.selectedGateIds.includes(g.id),
    );
    const distributed =
      axis === 'h'
        ? distributeHorizontally(selectedGates, customBlocks)
        : distributeVertically(selectedGates, customBlocks);
    const gateMap = new Map(distributed.map((g) => [g.id, g]));
    onCircuitChange({
      ...circuit,
      gates: circuit.gates.map((g) => gateMap.get(g.id) ?? g),
    });
  };

  const selCount = selection.selectedGateIds.length;
  const menuTarget = contextMenu.target;

  const alignItems: ContextMenuItem[] =
    selCount >= 2
      ? [
          { label: 'Align Left', onClick: () => applyAlign('left') },
          { label: 'Align Center', onClick: () => applyAlign('center') },
          { label: 'Align Right', onClick: () => applyAlign('right') },
          { label: 'Align Top', onClick: () => applyAlign('top') },
          { label: 'Align Middle', onClick: () => applyAlign('middle') },
          { label: 'Align Bottom', onClick: () => applyAlign('bottom') },
          ...(selCount >= 3
            ? [
                {
                  label: 'Distribute Horizontally',
                  separator: true,
                  onClick: () => applyDistribute('h'),
                },
                {
                  label: 'Distribute Vertically',
                  onClick: () => applyDistribute('v'),
                },
              ]
            : []),
        ]
      : [];

  let menuItems: ContextMenuItem[];
  if (menuTarget.type === 'gate') {
    const targetGate = circuit.gates.find((g) => g.id === menuTarget.gateId);
    const isBlock = targetGate ? isBlockInstance(targetGate) : false;
    menuItems = [
      {
        label: 'Copy',
        shortcut: 'Ctrl+C',
        disabled: selCount === 0,
        onClick: copySelection,
      },
      {
        label: 'Cut',
        shortcut: 'Ctrl+X',
        disabled: selCount === 0,
        onClick: cutSelection,
      },
      {
        label: 'Duplicate',
        disabled: selCount === 0,
        onClick: duplicateSelection,
      },
      {
        label:
          selCount > 1 ? `Delete (${selCount} gates)` : 'Delete Gate',
        shortcut: 'Del',
        danger: true,
        onClick: requestDeleteSelected,
      },
      ...(isBlock &&
      targetGate?.blockId &&
      onEnterEditMode
        ? [
            {
              label: 'Edit Block Internals',
              separator: true,
              onClick: () => onEnterEditMode(targetGate.blockId as ElementId),
            },
          ]
        : []),
      {
        label: 'Create Block...',
        disabled: selCount === 0 || !onCreateBlockRequest,
        separator: true,
        onClick: () => onCreateBlockRequest?.(),
      },
      ...alignItems,
    ];
  } else if (menuTarget.type === 'wire') {
    menuItems = [
      {
        label: 'Delete Wire',
        shortcut: 'Del',
        danger: true,
        onClick: () => {
          if (!onCircuitChange) return;
          onCircuitChange({
            ...circuit,
            wires: circuit.wires.filter((w) => w.id !== menuTarget.wireId),
            selectedElementId: null,
          });
          showToast('Wire deleted');
        },
      },
    ];
  } else {
    // Canvas background
    menuItems = [
      {
        label: 'Paste Here',
        shortcut: 'Ctrl+V',
        disabled: !clipboard.hasClipboard,
        onClick: () => pasteAt(contextMenu.pasteWorldPos),
      },
      {
        label: 'Select All',
        shortcut: 'Ctrl+A',
        disabled: circuit.gates.length === 0,
        separator: true,
        onClick: () => {
          if (onCircuitChange) {
            selection.selectAll(circuit, onCircuitChange);
          }
        },
      },
      {
        label: 'Create Block...',
        disabled: selCount === 0 || !onCreateBlockRequest,
        separator: true,
        onClick: () => onCreateBlockRequest?.(),
      },
      ...alignItems,
    ];
  }

  return (
    <div
      style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}
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
      {/* Port tooltip */}
      {hoveredPort && (
        <div
          style={{
            position: 'absolute',
            left: hoveredPort.screenX + 16,
            top: hoveredPort.screenY - 28,
            background: 'rgba(22, 33, 62, 0.94)',
            border: '1px solid #53a8b6',
            borderRadius: 4,
            padding: '3px 8px',
            fontSize: 11,
            fontFamily: 'monospace',
            color: '#eaeaea',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 200,
            backdropFilter: 'blur(4px)',
          }}
        >
          <span style={{ color: hoveredPort.isInput ? '#53a8b6' : '#00e676', fontWeight: 'bold' }}>
            {hoveredPort.isInput ? 'IN' : 'OUT'}
          </span>
          {' '}
          {hoveredPort.name}
        </div>
      )}
      {/* Wire hover tooltip */}
      {hoveredWireTooltip && hoveredWireScreenPos && (
        <div
          style={{
            position: 'absolute',
            left: hoveredWireScreenPos.x + 16,
            top: hoveredWireScreenPos.y - 32,
            background: 'rgba(22, 33, 62, 0.94)',
            border: `1px solid ${hoveredWireTooltip.signal ? '#00ff88' : '#4a4a6a'}`,
            borderRadius: 4,
            padding: '4px 10px',
            fontSize: 11,
            fontFamily: 'monospace',
            color: '#eaeaea',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 200,
            backdropFilter: 'blur(4px)',
          }}
        >
          <span style={{ color: '#53a8b6', fontWeight: 'bold' }}>
            {hoveredWireTooltip.fromGateLabel}
          </span>
          <span style={{ color: '#8888aa' }}>.{hoveredWireTooltip.fromPortName}</span>
          <span style={{ color: '#555', margin: '0 4px' }}>{' \u2192 '}</span>
          <span style={{ color: '#53a8b6', fontWeight: 'bold' }}>
            {hoveredWireTooltip.toGateLabel}
          </span>
          <span style={{ color: '#8888aa' }}>.{hoveredWireTooltip.toPortName}</span>
          <span style={{
            marginLeft: 6,
            color: hoveredWireTooltip.signal ? '#00ff88' : '#4a4a6a',
            fontWeight: 'bold',
            fontSize: 10,
          }}>
            [{hoveredWireTooltip.signal ? 'HIGH' : 'LOW'}]
          </span>
        </div>
      )}
      {/* Context-aware right-click menu */}
      <ContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        items={menuItems}
        onClose={closeContextMenu}
      />

      {/* Delete confirmation dialog (custom block instances) */}
      {deleteConfirm && (
        <div
          className="overlay-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 600,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(3px)',
          }}
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="overlay-panel"
            style={{
              background: 'rgba(12, 20, 40, 0.98)',
              border: '1px solid #a85d00',
              borderRadius: 10,
              padding: '18px 24px',
              maxWidth: 360,
              width: '90%',
              color: '#eaeaea',
              fontFamily: 'monospace',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 13, fontWeight: 'bold', color: '#ffb347', marginBottom: 8 }}>
              Delete {deleteConfirm.blockCount} custom block{deleteConfirm.blockCount > 1 ? 's' : ''}?
            </div>
            <div style={{ fontSize: 11, color: '#999', lineHeight: 1.5, marginBottom: 16 }}>
              This will remove {deleteConfirm.gateCount} gate{deleteConfirm.gateCount > 1 ? 's' : ''}{' '}
              (including {deleteConfirm.blockCount} block instance{deleteConfirm.blockCount > 1 ? 's' : ''})
              and any connected wires. The block definition stays in the Library.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                style={{
                  padding: '5px 14px',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  background: '#111a30',
                  color: '#c0c0d0',
                  border: '1px solid #1a3050',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </button>
              <button
                style={{
                  padding: '5px 14px',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  background: '#5a1a1a',
                  color: '#ff6b6b',
                  border: '1px solid #ff6b6b',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  performDeleteSelected();
                  setDeleteConfirm(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gate hover tooltip */}
      {hoveredGateInfo &&
        !hoveredPort &&
        (() => {
          const gate = circuit.gates.find((g) => g.id === hoveredGateInfo.gateId);
          if (!gate) return null;
          const gConfig = resolveGateConfig(gate);
          const isBlock = isBlockInstance(gate);
          const blockDef =
            isBlock && gate.blockId ? blockMap.current.get(gate.blockId) : null;
          const title = blockDef ? `${blockDef.icon} ${blockDef.name}` : gConfig.label;
          const desc = blockDef
            ? blockDef.description || 'Custom block'
            : GATE_TOOLTIPS[gate.type];
          const hint = isBlock
            ? 'Double-click to edit internals'
            : gate.type === 'INPUT'
              ? 'Double-click to toggle'
              : null;
          return (
            <div
              className="tooltip-container"
              style={{
                position: 'absolute',
                left: hoveredGateInfo.screenX + 16,
                top: hoveredGateInfo.screenY - 34,
                background: 'rgba(22, 33, 62, 0.94)',
                border: '1px solid #53a8b6',
                borderRadius: 4,
                padding: '4px 10px',
                pointerEvents: 'none',
                zIndex: 200,
                backdropFilter: 'blur(4px)',
                whiteSpace: 'nowrap',
              }}
            >
              <div style={{ fontWeight: 'bold', color: '#53a8b6', fontSize: 11 }}>
                {title}
              </div>
              <div style={{ color: '#c0c0d0', fontSize: 10 }}>{desc}</div>
              <div style={{ color: '#8888aa', fontSize: 9 }}>
                Output: {gate.outputState ? 'HIGH' : 'LOW'}
                {hint ? ` • ${hint}` : ''}
              </div>
            </div>
          );
        })()}
    </div>
  );
};
