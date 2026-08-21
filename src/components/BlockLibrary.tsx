// ============================================================
// BlockLibrary — sidebar palette with categories, search,
//   click-to-place mode, drag preview with gate icon,
//   delete confirmation, smooth transitions
// ============================================================

import { useState, useMemo, useCallback } from 'react';
import type { CustomBlockDefinition, ElementId, GateType } from '@/types/circuit';
import { getGateConfig } from '@/utils/gateConfigs';

// Gate categories for the palette
interface GateCategory {
  label: string;
  icon: string;
  gates: GateType[];
}

const GATE_CATEGORIES: GateCategory[] = [
  {
    label: 'I/O',
    icon: '⊕',
    gates: ['INPUT', 'OUTPUT', 'CONSTANT_HIGH', 'CONSTANT_LOW'],
  },
  {
    label: 'Basic',
    icon: '&',
    gates: ['AND', 'OR', 'NOT'],
  },
  {
    label: 'Advanced',
    icon: '=1',
    gates: ['NAND', 'NOR', 'XOR', 'XNOR'],
  },
];

// Icon map for gate types
const GATE_ICONS: Record<GateType, string> = {
  INPUT: '⊕',
  OUTPUT: '◉',
  CONSTANT_HIGH: '1',
  CONSTANT_LOW: '0',
  AND: '&',
  OR: '≥1',
  NOT: '¬',
  NAND: '&̄',
  NOR: '≥1̄',
  XOR: '=1',
  XNOR: '=1̄',
};

// Tooltip descriptions for each gate
const GATE_DESCRIPTIONS: Record<GateType, string> = {
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

interface BlockLibraryProps {
  customBlocks: CustomBlockDefinition[];
  onDeleteBlock: (blockId: ElementId) => void;
  onDragBlock: (blockId: ElementId, startX: number, startY: number) => void;
  /** Called when user clicks a gate in palette (for click-to-place mode) */
  onSelectGateForPlacement?: (gateType: GateType) => void;
  /** Called when user clicks a custom block in palette */
  onSelectBlockForPlacement?: (blockId: ElementId) => void;
  /** Currently selected gate type for click-to-place */
  selectedGateType?: GateType | null;
  /** Currently selected block for click-to-place */
  selectedBlockId?: ElementId | null;
}

export const BlockLibrary: React.FC<BlockLibraryProps> = ({
  customBlocks,
  onDeleteBlock,
  onDragBlock,
  onSelectGateForPlacement,
  onSelectBlockForPlacement,
  selectedGateType,
  selectedBlockId,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<ElementId | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const toggleCategory = (label: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  // Filter gates by search query
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return GATE_CATEGORIES;
    const q = searchQuery.toLowerCase();
    return GATE_CATEGORIES.map((cat) => ({
      ...cat,
      gates: cat.gates.filter(
        (g) =>
          g.toLowerCase().includes(q) ||
          getGateConfig(g).label.toLowerCase().includes(q) ||
          (GATE_DESCRIPTIONS[g] || '').toLowerCase().includes(q),
      ),
    })).filter((cat) => cat.gates.length > 0);
  }, [searchQuery]);

  const filteredCustomBlocks = useMemo(() => {
    if (!searchQuery.trim()) return customBlocks;
    const q = searchQuery.toLowerCase();
    return customBlocks.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q),
    );
  }, [searchQuery, customBlocks]);

  const handleGateDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, gateType: GateType) => {
      e.dataTransfer.setData('application/x-gate-type', gateType);
      e.dataTransfer.effectAllowed = 'copy';

      // Create a custom drag preview with gate icon
      const ghost = document.createElement('div');
      ghost.style.cssText = `
        display: flex; align-items: center; gap: 8px;
        padding: 8px 12px; border-radius: 6px;
        background: rgba(22, 33, 62, 0.95);
        border: 1px solid #53a8b6;
        font-family: monospace; font-size: 12px;
        color: #eaeaea; white-space: nowrap;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      `;
      ghost.innerHTML = `<span style="color:#53a8b6;font-size:14px;">${GATE_ICONS[gateType]}</span><span>${getGateConfig(gateType).label}</span>`;
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 0, 0);
      // Clean up ghost element after a tick
      requestAnimationFrame(() => {
        document.body.removeChild(ghost);
      });
    },
    [],
  );

  const handleBlockDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, block: CustomBlockDefinition) => {
      e.dataTransfer.setData('application/x-custom-block', block.id);
      e.dataTransfer.effectAllowed = 'copy';
      onDragBlock(block.id, e.clientX, e.clientY);

      // Custom drag preview
      const ghost = document.createElement('div');
      ghost.style.cssText = `
        display: flex; align-items: center; gap: 8px;
        padding: 8px 12px; border-radius: 6px;
        background: rgba(22, 33, 62, 0.95);
        border: 1px solid #2a5a8a;
        font-family: monospace; font-size: 12px;
        color: #eaeaea; white-space: nowrap;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      `;
      ghost.innerHTML = `<span style="font-size:14px;">${block.icon}</span><span>${block.name}</span>`;
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 0, 0);
      requestAnimationFrame(() => {
        document.body.removeChild(ghost);
      });
    },
    [onDragBlock],
  );

  const handleGateClick = useCallback(
    (gateType: GateType) => {
      if (onSelectGateForPlacement) {
        onSelectGateForPlacement(gateType);
      }
    },
    [onSelectGateForPlacement],
  );

  const handleBlockClick = useCallback(
    (blockId: ElementId) => {
      if (onSelectBlockForPlacement) {
        onSelectBlockForPlacement(blockId);
      }
    },
    [onSelectBlockForPlacement],
  );

  const handleDelete = (blockId: ElementId) => {
    if (confirmDeleteId === blockId) {
      onDeleteBlock(blockId);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(blockId);
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  const hasCustomBlocks = customBlocks.length > 0;
  const hasSearch = searchQuery.trim().length > 0;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div
        style={styles.header}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span style={styles.headerText}>Library</span>
        <span style={styles.chevron}>{collapsed ? '▶' : '▼'}</span>
      </div>

      {!collapsed && (
        <>
          {/* Search bar */}
          <div style={styles.searchWrapper}>
            <span style={styles.searchIcon}>🔍</span>
            <input
              className="search-input"
              type="text"
              placeholder="Search gates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            {searchQuery && (
              <button
                style={styles.searchClear}
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchQuery('');
                }}
              >
                ×
              </button>
            )}
          </div>

          {/* Click-to-place indicator */}
          {(selectedGateType || selectedBlockId) && (
            <div style={styles.placementIndicator}>
              <span style={styles.placementDot} />
              <span style={styles.placementText}>
                Click canvas to place • Esc to cancel
              </span>
            </div>
          )}

          {/* Standard gates by category */}
          <div className="palette-scroll" style={styles.scrollArea}>
            {filteredCategories.map((cat) => {
              const isCatCollapsed = collapsedCategories.has(cat.label);
              return (
                <div key={cat.label}>
                  <div
                    style={styles.categoryHeader}
                    onClick={() => toggleCategory(cat.label)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={styles.categoryIcon}>{cat.icon}</span>
                      <span style={styles.categoryText}>{cat.label}</span>
                    </div>
                    <span style={styles.chevron}>
                      {isCatCollapsed ? '▶' : '▼'}
                    </span>
                  </div>
                  {!isCatCollapsed && (
                    <div>
                      {cat.gates.map((gateType) => {
                        const config = getGateConfig(gateType);
                        const isSelected = selectedGateType === gateType;
                        return (
                          <div
                            key={gateType}
                            className={`palette-item${isSelected ? ' selected' : ''}`}
                            style={styles.blockItem}
                            draggable
                            onDragStart={(e) => handleGateDragStart(e, gateType)}
                            onClick={() => handleGateClick(gateType)}
                            title={`${config.label} — ${GATE_DESCRIPTIONS[gateType]}\nClick to place • Drag to drop`}
                          >
                            <div style={styles.blockInfo}>
                              <span style={{
                                ...styles.gateIcon,
                                color: isSelected ? '#00e676' : '#53a8b6',
                              }}>{GATE_ICONS[gateType]}</span>
                              <div style={styles.blockDetails}>
                                <span style={styles.blockName}>{config.label}</span>
                                <span style={styles.blockPorts}>
                                  {config.inputs.length} in / {config.outputs.length} out
                                </span>
                              </div>
                            </div>
                            {isSelected && (
                              <span style={styles.activeIndicator}>●</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Custom blocks section */}
            {hasCustomBlocks && (
              <>
                <div style={styles.divider} />
                <div
                  style={styles.categoryHeader}
                  onClick={() => toggleCategory('Custom')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={styles.categoryIcon}>★</span>
                    <span style={styles.categoryText}>
                      Custom ({filteredCustomBlocks.length})
                    </span>
                  </div>
                  <span style={styles.chevron}>
                    {collapsedCategories.has('Custom') ? '▶' : '▼'}
                  </span>
                </div>
                {!collapsedCategories.has('Custom') && (
                  <div>
                    {filteredCustomBlocks.map((block) => {
                      const isSelected = selectedBlockId === block.id;
                      return (
                        <div
                          key={block.id}
                          className={`palette-item${isSelected ? ' selected' : ''}`}
                          style={styles.blockItem}
                          draggable
                          onDragStart={(e) => handleBlockDragStart(e, block)}
                          onClick={() => handleBlockClick(block.id)}
                          title={`${block.name} — ${block.description || 'Custom block'}\nClick to place • Drag to drop`}
                        >
                          <div style={styles.blockInfo}>
                            <span style={styles.gateIcon}>{block.icon}</span>
                            <div style={styles.blockDetails}>
                              <span style={styles.blockName}>{block.name}</span>
                              <span style={styles.blockPorts}>
                                {block.inputPorts.length} in / {block.outputPorts.length} out
                              </span>
                            </div>
                          </div>
                          <button
                            style={{
                              ...styles.deleteBtn,
                              color: confirmDeleteId === block.id ? '#e94560' : '#555',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(block.id);
                            }}
                            title={
                              confirmDeleteId === block.id
                                ? 'Click again to confirm deletion'
                                : 'Delete block (click twice)'
                            }
                          >
                            {confirmDeleteId === block.id ? '✓' : '×'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* No results */}
            {hasSearch && filteredCategories.length === 0 && filteredCustomBlocks.length === 0 && (
              <div style={styles.noResults}>
                <span style={{ fontSize: 11, color: '#555' }}>
                  No gates matching "{searchQuery}"
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------
// Styles
// ---------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 100,
    background: 'rgba(10, 15, 30, 0.94)',
    borderRadius: 10,
    border: '1px solid #1a3050',
    backdropFilter: 'blur(8px)',
    userSelect: 'none',
    minWidth: 170,
    maxWidth: 220,
    maxHeight: 'calc(100vh - 40px)',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(15,52,96,0.2)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '7px 10px',
    cursor: 'pointer',
    borderBottom: '1px solid #1a3050',
    background: 'rgba(15, 52, 96, 0.1)',
  },
  headerText: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    color: '#eaeaea',
  },
  chevron: {
    fontSize: 8,
    color: '#666',
    transition: 'transform 0.15s ease',
  },
  searchWrapper: {
    position: 'relative',
    padding: '6px 8px',
    borderBottom: '1px solid rgba(15, 52, 96, 0.4)',
  },
  searchIcon: {
    position: 'absolute',
    left: 14,
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: 10,
    color: '#555',
    pointerEvents: 'none',
  },
  searchClear: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: '#666',
    fontSize: 14,
    cursor: 'pointer',
    padding: '0 2px',
    lineHeight: 1,
  },
  placementIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderBottom: '1px solid rgba(15, 52, 96, 0.4)',
    background: 'rgba(0, 230, 118, 0.06)',
  },
  placementDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: '#00e676',
    boxShadow: '0 0 4px #00e676',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  placementText: {
    fontSize: 9,
    fontFamily: 'monospace',
    color: '#00e676',
  },
  scrollArea: {
    overflowY: 'auto',
    flex: 1,
  },
  categoryHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '5px 10px',
    cursor: 'pointer',
    borderBottom: '1px solid rgba(15, 52, 96, 0.3)',
    background: 'rgba(15, 52, 96, 0.15)',
    transition: 'background 0.1s ease',
  },
  categoryIcon: {
    fontSize: 10,
    color: '#53a8b6',
    width: 14,
    textAlign: 'center',
  },
  categoryText: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    color: '#8888aa',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  divider: {
    height: 1,
    background: 'linear-gradient(to right, transparent, #1a3050, transparent)',
    margin: '2px 0',
  },
  blockItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '5px 10px',
    cursor: 'grab',
  },
  blockInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  gateIcon: {
    fontSize: 13,
    width: 20,
    textAlign: 'center',
    color: '#53a8b6',
  },
  blockDetails: {
    display: 'flex',
    flexDirection: 'column',
  },
  blockName: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#eaeaea',
  },
  blockPorts: {
    fontSize: 9,
    fontFamily: 'monospace',
    color: '#666',
  },
  activeIndicator: {
    fontSize: 6,
    color: '#00e676',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    fontSize: 14,
    cursor: 'pointer',
    padding: '0 4px',
    fontFamily: 'monospace',
    lineHeight: 1,
    transition: 'color 0.12s ease',
  },
  noResults: {
    padding: '12px 10px',
    textAlign: 'center',
  },
};
