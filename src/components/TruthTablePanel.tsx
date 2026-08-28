// ============================================================
// TruthTablePanel — enumerates the circuit's input/output behaviour
// ============================================================

import { useMemo } from 'react';
import type { CircuitState, CustomBlockDefinition } from '@/types/circuit';
import { MAX_TRUTH_TABLE_INPUTS, buildTruthTable, sumOfProducts } from '@/utils/truthTable';
import { buttonStyle, panelStyle, theme } from '@/theme';

interface TruthTablePanelProps {
  visible: boolean;
  circuit: CircuitState;
  blocks: CustomBlockDefinition[];
  onClose: () => void;
}

const cell: React.CSSProperties = {
  padding: '3px 10px',
  textAlign: 'center',
  fontFamily: theme.mono,
  fontSize: 11,
  borderBottom: `1px solid ${theme.divider}`,
};

export const TruthTablePanel: React.FC<TruthTablePanelProps> = ({
  visible,
  circuit,
  blocks,
  onClose,
}) => {
  // A truth table costs 2^n evaluations, and the circuit object changes
  // on every simulation tick. Key the memo on the circuit's *shape* so
  // the table is only rebuilt when the wiring actually changes.
  const shape =
    circuit.gates.map((g) => `${g.id}:${g.type}:${g.inputCount ?? ''}:${g.label ?? ''}`).join('|') +
    '#' +
    circuit.wires
      .map((w) => `${w.fromGateId}${w.fromPortIndex}${w.toGateId}${w.toPortIndex}`)
      .join('|');

  const table = useMemo(
    () => (visible ? buildTruthTable(circuit, blocks) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, blocks, shape],
  );

  if (!visible || !table) return null;

  const empty = table.inputs.length === 0 || table.outputs.length === 0;

  return (
    <div
      style={{
        ...panelStyle,
        position: 'absolute',
        bottom: 68,
        left: 16,
        zIndex: 120,
        width: 340,
        maxHeight: '58vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: `1px solid ${theme.panelBorder}`,
        }}
      >
        <span
          style={{
            fontFamily: theme.mono,
            fontSize: 11,
            letterSpacing: 0.6,
            color: theme.text,
            fontWeight: 600,
          }}
        >
          TRUTH TABLE
        </span>
        <button style={{ ...buttonStyle, padding: '2px 8px' }} onClick={onClose} title="Close">
          ✕
        </button>
      </header>

      {empty ? (
        <p
          style={{
            margin: 0,
            padding: '16px 12px',
            fontFamily: theme.sans,
            fontSize: 12,
            lineHeight: 1.5,
            color: theme.textDim,
          }}
        >
          Add at least one <strong style={{ color: theme.text }}>IN</strong> switch and one{' '}
          <strong style={{ color: theme.text }}>OUT</strong> probe, then wire them up — the table
          fills in automatically.
        </p>
      ) : (
        <>
          {(table.truncated || table.sequential) && (
            <p
              style={{
                margin: 0,
                padding: '7px 12px',
                fontFamily: theme.sans,
                fontSize: 11,
                lineHeight: 1.45,
                color: theme.warn,
                background: 'rgba(255, 180, 84, 0.08)',
                borderBottom: `1px solid ${theme.divider}`,
              }}
            >
              {table.truncated &&
                `Showing the first ${MAX_TRUTH_TABLE_INPUTS} switches. `}
              {table.sequential &&
                'This circuit has memory, so each row is the settled response from a cleared state.'}
            </p>
          )}

          <div style={{ overflow: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {table.inputs.map((c) => (
                    <th
                      key={c.id}
                      style={{
                        ...cell,
                        position: 'sticky',
                        top: 0,
                        background: theme.panelSolid,
                        color: theme.accent,
                        fontWeight: 600,
                      }}
                    >
                      {c.label}
                    </th>
                  ))}
                  {table.outputs.map((c, i) => (
                    <th
                      key={c.id}
                      style={{
                        ...cell,
                        position: 'sticky',
                        top: 0,
                        background: theme.panelSolid,
                        color: theme.high,
                        fontWeight: 600,
                        borderLeft: i === 0 ? `1px solid ${theme.panelBorder}` : undefined,
                      }}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.inputs.map((v, i) => (
                      <td key={i} style={{ ...cell, color: v ? theme.text : theme.textFaint }}>
                        {v ? 1 : 0}
                      </td>
                    ))}
                    {row.outputs.map((v, i) => (
                      <td
                        key={i}
                        style={{
                          ...cell,
                          color: v ? theme.high : theme.textFaint,
                          fontWeight: v ? 600 : 400,
                          borderLeft: i === 0 ? `1px solid ${theme.panelBorder}` : undefined,
                        }}
                      >
                        {v ? 1 : 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer
            style={{
              padding: '7px 12px',
              borderTop: `1px solid ${theme.panelBorder}`,
              fontFamily: theme.mono,
              fontSize: 10,
              color: theme.textDim,
              lineHeight: 1.6,
              maxHeight: 72,
              overflow: 'auto',
            }}
          >
            {table.outputs.map((c, i) => (
              <div key={c.id} style={{ wordBreak: 'break-word' }}>
                <span style={{ color: theme.high }}>{c.label}</span> = {sumOfProducts(table, i)}
              </div>
            ))}
          </footer>
        </>
      )}
    </div>
  );
};
