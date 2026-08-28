// ============================================================
// useBlocks — manages custom block definitions, localStorage
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import type {
  CircuitState,
  CustomBlockDefinition,
  ElementId,
} from '@/types/circuit';
import { buildBlockDefinition } from '@/utils/blockUtils';

const BLOCKS_STORAGE_KEY = 'logic-sim-custom-blocks';

// ---------------------------------------------------------------
// LocalStorage helpers
// ---------------------------------------------------------------

const persistBlocks = (blocks: CustomBlockDefinition[]): void => {
  try {
    localStorage.setItem(BLOCKS_STORAGE_KEY, JSON.stringify(blocks));
  } catch {
    // localStorage may be full or unavailable — silently fail
  }
};

const loadBlocks = (): CustomBlockDefinition[] => {
  try {
    const raw = localStorage.getItem(BLOCKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomBlockDefinition[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

// ---------------------------------------------------------------
// useBlocks hook
// ---------------------------------------------------------------

export interface UseBlocksReturn {
  /** All saved custom block definitions */
  customBlocks: CustomBlockDefinition[];

  /** Create a new block from selected gates */
  createBlock: (
    name: string,
    description: string,
    icon: string,
    circuit: CircuitState,
    selectedGateIds: ElementId[],
  ) => CustomBlockDefinition | null;

  /** Delete a custom block definition by ID */
  deleteBlock: (blockId: ElementId) => void;

  /** Update an existing block definition (used by block editor) */
  updateBlock: (blockDef: CustomBlockDefinition) => void;

  /** Get a block definition by ID */
  getBlock: (blockId: ElementId) => CustomBlockDefinition | undefined;

  /** Get a block definition by name (case-insensitive) */
  getBlockByName: (name: string) => CustomBlockDefinition | undefined;

  /** Replace the whole library, e.g. when opening a saved circuit */
  replaceAll: (blocks: CustomBlockDefinition[]) => void;
}

export const useBlocks = (
  initial?: CustomBlockDefinition[],
): UseBlocksReturn => {
  const [customBlocks, setCustomBlocks] = useState<CustomBlockDefinition[]>(
    () => (initial && initial.length > 0 ? initial : loadBlocks()),
  );

  // Persist whenever blocks change
  useEffect(() => {
    persistBlocks(customBlocks);
  }, [customBlocks]);

  const createBlock = useCallback(
    (
      name: string,
      description: string,
      icon: string,
      circuit: CircuitState,
      selectedGateIds: ElementId[],
    ): CustomBlockDefinition | null => {
      const blockDef = buildBlockDefinition(
        name,
        description,
        icon,
        circuit,
        selectedGateIds,
      );
      if (!blockDef) return null;

      setCustomBlocks((prev) => [...prev, blockDef]);
      return blockDef;
    },
    [],
  );

  const deleteBlock = useCallback((blockId: ElementId) => {
    setCustomBlocks((prev) => prev.filter((b) => b.id !== blockId));
  }, []);

  const updateBlock = useCallback((blockDef: CustomBlockDefinition) => {
    setCustomBlocks((prev) =>
      prev.map((b) => (b.id === blockDef.id ? blockDef : b)),
    );
  }, []);

  const getBlock = useCallback(
    (blockId: ElementId): CustomBlockDefinition | undefined => {
      return customBlocks.find((b) => b.id === blockId);
    },
    [customBlocks],
  );

  const getBlockByName = useCallback(
    (name: string): CustomBlockDefinition | undefined => {
      return customBlocks.find(
        (b) => b.name.toLowerCase() === name.toLowerCase(),
      );
    },
    [customBlocks],
  );

  const replaceAll = useCallback((blocks: CustomBlockDefinition[]) => {
    setCustomBlocks(blocks);
  }, []);

  return {
    customBlocks,
    replaceAll,
    createBlock,
    deleteBlock,
    updateBlock,
    getBlock,
    getBlockByName,
  };
};
