// ============================================================
// Persistence — autosave, named saves, and file import/export.
//
// Everything is validated on the way in: a corrupt localStorage
// entry or a hand-edited JSON file must never take the app down.
// ============================================================

import type {
  CircuitState,
  CustomBlockDefinition,
  Gate,
  Viewport,
  Wire,
} from '@/types/circuit';

export const SCHEMA_VERSION = 2;

const AUTOSAVE_KEY = 'lgs.autosave';
const LIBRARY_KEY = 'lgs.saves';

export interface CircuitDocument {
  version: number;
  name: string;
  savedAt: number;
  circuit: CircuitState;
  blocks: CustomBlockDefinition[];
  viewport?: Viewport;
}

// ---------------------------------------------------------------
// Validation
// ---------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const bool = (v: unknown): boolean => v === true;

const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : fallback;

const parseGate = (raw: unknown): Gate | null => {
  if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.type !== 'string') return null;
  const pos = isObj(raw.position) ? raw.position : {};
  const gate: Gate = {
    id: raw.id,
    type: raw.type as Gate['type'],
    position: { x: num(pos.x), y: num(pos.y) },
    outputState: bool(raw.outputState),
  };
  if (Array.isArray(raw.outputStates)) gate.outputStates = raw.outputStates.map(bool);
  if (typeof raw.inputCount === 'number') gate.inputCount = num(raw.inputCount, 2);
  if (typeof raw.label === 'string') gate.label = raw.label;
  if (typeof raw.blockId === 'string') gate.blockId = raw.blockId;
  if (typeof raw.clockPeriod === 'number') gate.clockPeriod = num(raw.clockPeriod, 4);
  if (isObj(raw.memory)) {
    gate.memory = {
      q: bool(raw.memory.q),
      lastClk: bool(raw.memory.lastClk),
      phase: num(raw.memory.phase),
      period: typeof raw.memory.period === 'number' ? num(raw.memory.period, 4) : undefined,
    };
  }
  return gate;
};

const parseWire = (raw: unknown): Wire | null => {
  if (
    !isObj(raw) ||
    typeof raw.id !== 'string' ||
    typeof raw.fromGateId !== 'string' ||
    typeof raw.toGateId !== 'string'
  ) {
    return null;
  }
  return {
    id: raw.id,
    fromGateId: raw.fromGateId,
    fromPortIndex: num(raw.fromPortIndex),
    toGateId: raw.toGateId,
    toPortIndex: num(raw.toPortIndex),
    signal: bool(raw.signal),
    waypoints: Array.isArray(raw.waypoints)
      ? raw.waypoints.filter(isObj).map((p) => ({ x: num(p.x), y: num(p.y) }))
      : [],
  };
};

const parseCircuit = (raw: unknown): CircuitState => {
  const src = isObj(raw) ? raw : {};
  const gates = Array.isArray(src.gates)
    ? (src.gates.map(parseGate).filter(Boolean) as Gate[])
    : [];
  const gateIds = new Set(gates.map((g) => g.id));
  const wires = Array.isArray(src.wires)
    ? (src.wires.map(parseWire).filter(Boolean) as Wire[]).filter(
        // Drop wires whose endpoints did not survive validation
        (w) => gateIds.has(w.fromGateId) && gateIds.has(w.toGateId),
      )
    : [];
  return { gates, wires, selectedElementId: null, selectedGateIds: [] };
};

const parseBlock = (raw: unknown): CustomBlockDefinition | null => {
  if (!isObj(raw) || typeof raw.id !== 'string') return null;
  const inner = parseCircuit({ gates: raw.internalGates, wires: raw.internalWires });
  const ports = (v: unknown) =>
    Array.isArray(v)
      ? v.filter(isObj).map((p) => ({
          internalGateId: str(p.internalGateId),
          portIndex: num(p.portIndex),
          name: str(p.name, '?'),
        }))
      : [];
  return {
    id: raw.id,
    name: str(raw.name, 'Block'),
    description: str(raw.description),
    icon: str(raw.icon, '▣'),
    internalGates: inner.gates,
    internalWires: inner.wires,
    inputPorts: ports(raw.inputPorts),
    outputPorts: ports(raw.outputPorts),
    timestamp: num(raw.timestamp, Date.now()),
  };
};

/** Turn arbitrary parsed JSON into a usable document, or null */
export const parseDocument = (raw: unknown): CircuitDocument | null => {
  if (!isObj(raw)) return null;
  // A bare circuit (no envelope) is accepted too
  const body = 'circuit' in raw ? raw.circuit : raw;
  const circuit = parseCircuit(body);
  if (circuit.gates.length === 0 && circuit.wires.length === 0 && !('circuit' in raw)) {
    return null;
  }
  const vp = isObj(raw.viewport) ? raw.viewport : null;
  return {
    version: num(raw.version, SCHEMA_VERSION),
    name: str(raw.name, 'Untitled circuit'),
    savedAt: num(raw.savedAt, Date.now()),
    circuit,
    blocks: Array.isArray(raw.blocks)
      ? (raw.blocks.map(parseBlock).filter(Boolean) as CustomBlockDefinition[])
      : [],
    viewport: vp
      ? { offsetX: num(vp.offsetX), offsetY: num(vp.offsetY), zoom: num(vp.zoom, 1) }
      : undefined,
  };
};

// ---------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------

export const buildDocument = (
  name: string,
  circuit: CircuitState,
  blocks: CustomBlockDefinition[],
  viewport?: Viewport,
): CircuitDocument => ({
  version: SCHEMA_VERSION,
  name,
  savedAt: Date.now(),
  // Selection is editor state, not circuit state — don't persist it
  circuit: { ...circuit, selectedElementId: null, selectedGateIds: [] },
  blocks,
  viewport,
});

export const serializeDocument = (doc: CircuitDocument): string =>
  JSON.stringify(doc, null, 2);

export const deserializeDocument = (json: string): CircuitDocument | null => {
  try {
    return parseDocument(JSON.parse(json));
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------
// localStorage — all access guarded (private mode, quota, SSR)
// ---------------------------------------------------------------

const readKey = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeKey = (key: string, value: string): boolean => {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

/** Save the working circuit so a refresh does not lose it */
export const saveAutosave = (doc: CircuitDocument): boolean =>
  writeKey(AUTOSAVE_KEY, serializeDocument(doc));

export const loadAutosave = (): CircuitDocument | null => {
  const raw = readKey(AUTOSAVE_KEY);
  return raw ? deserializeDocument(raw) : null;
};

export const clearAutosave = (): void => {
  try {
    window.localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* ignore */
  }
};

// --- named saves ---

export interface SavedEntry {
  name: string;
  savedAt: number;
}

const readLibrary = (): Record<string, CircuitDocument> => {
  const raw = readKey(LIBRARY_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!isObj(parsed)) return {};
    const out: Record<string, CircuitDocument> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const doc = parseDocument(v);
      if (doc) out[k] = doc;
    }
    return out;
  } catch {
    return {};
  }
};

export const listSaved = (): SavedEntry[] =>
  Object.values(readLibrary())
    .map((d) => ({ name: d.name, savedAt: d.savedAt }))
    .sort((a, b) => b.savedAt - a.savedAt);

export const saveNamed = (doc: CircuitDocument): boolean => {
  const lib = readLibrary();
  lib[doc.name] = doc;
  return writeKey(LIBRARY_KEY, JSON.stringify(lib));
};

export const loadNamed = (name: string): CircuitDocument | null =>
  readLibrary()[name] ?? null;

export const deleteNamed = (name: string): boolean => {
  const lib = readLibrary();
  delete lib[name];
  return writeKey(LIBRARY_KEY, JSON.stringify(lib));
};

// ---------------------------------------------------------------
// File import / export
// ---------------------------------------------------------------

const slug = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'circuit';

/** Trigger a browser download of the document as .json */
export const downloadDocument = (doc: CircuitDocument): void => {
  const blob = new Blob([serializeDocument(doc)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug(doc.name)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next frame so Safari has time to start the download
  requestAnimationFrame(() => URL.revokeObjectURL(url));
};

/** Open a file picker and resolve with the parsed document */
export const importDocumentFromFile = (): Promise<CircuitDocument | null> =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(deserializeDocument(String(reader.result)));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
