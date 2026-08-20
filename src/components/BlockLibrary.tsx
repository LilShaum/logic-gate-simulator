// ============================================================
// BlockLibrary — sidebar palette showing standard gates + custom blocks
// ============================================================

import { useState } from 'react';
import type { CustomBlockDefinition, ElementId, GateType } from '@/types/circuit';
import { getGateConfig } from '@/utils/gateConfigs';

// Gate categories for the palette
interface GateCategory {
  label: string;
  gates: GateType[];
}

const GATE_CATEGORIES: GateCategory[] = [
  {
    label: 'I/O',
    gates: ['INPUT', 'OUTPUT', 'CONSTANT_HIGH', 'CONSTANT_LOW'],
  },
  {
    label: 'Basic',
    gates: ['AND', 'OR', 'NOT'],
  },
  {
    label: 'Advanced',
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

interface BlockLibraryProps {
  customBlocks: CustomBlockDefinition[];
  onDeleteBlock: (blockId: ElementId) => void;
  onDragBlock: (blockId: ElementId, startX: number, startY: number) => void;
}

export const BlockLibrary: React.FC<BlockLibraryProps> = ({
  customBlocks,
  onDeleteBlock,
  onDragBlock,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<ElementId | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

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

  const handleGateDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    gateType: GateType,
  ) => {
    e.dataTransfer.setData('application/x-gate-type', gateType);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleBlockDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    block: CustomBlockDefinition,
  ) => {
    e.dataTransfer.setData('application/x-custom-block', block.id);
    e.dataTransfer.effectAllowed = 'copy';
    onDragBlock(block.id, e.clientX, e.clientY);
  };

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

  return (
    <div style={styles.container}>
      {/* Header */}
      <div
        style={styles.header}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span style={styles.headerText}>
          Library
        </span>
        <span style={styles.chevron}>{collapsed ? '▶' : '▼'}</span>
      </div>

      {!collapsed && (
        <>
          {/* Standard gates by category */}
          {GATE_CATEGORIES.map((cat) => {
            const isCatCollapsed = collapsedCategories.has(cat.label);
            return (
              <div key={cat.label}>
                <div
                  style={styles.categoryHeader}
                  onClick={() => toggleCategory(cat.label)}
                >
                  <span style={styles.categoryText}>
                    {cat.label}
                  </span>
                  <span style={styles.chevron}>
                    {isCatCollapsed ? '▶' : '▼'}
                  </span>
                </div>
                {!isCatCollapsed && (
                  <div style={styles.list}>
                    {cat.gates.map((gateType) => {
                      const config = getGateConfig(gateType);
                      return (
                        <div
                          key={gateType}
                          style={styles.blockItem}
                          draggable
                          onDragStart={(e) => handleGateDragStart(e, gateType)}
                        >
                          <div style={styles.blockInfo}>
                            <span style={styles.gateIcon}>{GATE_ICONS[gateType]}</span>
                            <div style={styles.blockDetails}>
                              <span style={styles.blockName}>{config.label}</span>
                              <span style={styles.blockPorts}>
                                {config.inputs.length} in / {config.outputs.length} out
                              </span>
                            </div>
                          </div>
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
                <span style={styles.categoryText}>
                  Custom Blocks ({customBlocks.length})
                </span>
                <span style={styles.chevron}>
                  {collapsedCategories.has('Custom') ? '▶' : '▼'}
                </span>
              </div>
              {!collapsedCategories.has('Custom') && (
                <div style={styles.list}>
                  {customBlocks.map((block) => (
                    <div
                      key={block.id}
                      style={styles.blockItem}
                      draggable
                      onDragStart={(e) => handleBlockDragStart(e, block)}
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
                            ? 'Click again to confirm'
                            : 'Delete block'
                        }
                      >
                        {confirmDeleteId === block.id ? '✓' : '×'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
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
    background: 'rgba(22, 33, 62, 0.92)',
    borderRadius: 8,
    border: '1px solid #0f3460',
    backdropFilter: 'blur(6px)',
    userSelect: 'none',
    minWidth: 160,
    maxWidth: 220,
    maxHeight: 'calc(100vh - 24px)',
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    cursor: 'pointer',
    borderBottom: '1px solid #0f3460',
  },
  headerText: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    color: '#eaeaea',
  },
  chevron: {
    fontSize: 9,
    color: '#8888aa',
  },
  categoryHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 10px',
    cursor: 'pointer',
    borderBottom: '1px solid rgba(15, 52, 96, 0.5)',
    background: 'rgba(15, 52, 96, 0.2)',
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
    background: '#0f3460',
    margin: '2px 0',
  },
  list: {
    padding: '2px 0',
  },
  blockItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 10px',
    cursor: 'grab',
    transition: 'background 0.15s',
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
    color: '#8888aa',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    fontSize: 14,
    cursor: 'pointer',
    padding: '0 4px',
    fontFamily: 'monospace',
    lineHeight: 1,
  },
};
