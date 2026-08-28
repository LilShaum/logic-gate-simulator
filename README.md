# Logic Gate Simulator

Build digital circuits in the browser, wire them up, and watch the signals move.

**[Open the simulator →](https://lilshaum.github.io/logic-gate-simulator/)**

---

## What it does

**The circuit is always live.** Flip a switch or drop a wire and every downstream
gate updates in the same frame. You never have to press Play to see what your
circuit does — Play is only for circuits that need the passage of time.

**Gates**

| Group | Types |
| --- | --- |
| I/O | switch, LED probe, constant 0/1, free-running clock |
| Combinational | AND, OR, NOT, BUFFER, NAND, NOR, XOR, XNOR |
| Memory | D flip-flop, T flip-flop, SR latch |

AND, OR, NAND, NOR, XOR and XNOR take between 2 and 8 inputs. The symbol grows
to fit and the pins stay evenly spaced.

**Custom blocks.** Select part of a circuit, turn it into a named block, and drop
copies of it anywhere. Blocks nest — a block can contain other blocks — and they
simulate exactly like the gates inside them. Double-click one to edit its guts.

**Truth tables.** Press `T`. Every combination of the circuit's switches is
enumerated and its outputs tabulated, with a sum-of-products expression for each
output column underneath.

**It remembers your work.** The circuit autosaves to your browser as you edit, so
a refresh picks up where you left off. `Ctrl+S` keeps a named copy; Export and
Import move circuits between machines as `.json`.

## Keyboard

| | |
| --- | --- |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+S` | Save |
| `T` | Toggle the truth table |
| `?` | All shortcuts |
| Scroll | Zoom |
| Space / middle / alt + drag | Pan |
| Double-click a switch | Toggle it |
| Double-click a block | Edit its internals |

## Running it locally

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm test           # simulation, geometry, truth tables, persistence
npm run typecheck
npm run lint
npm run build
```

## How the simulation works

The circuit you draw is not what gets evaluated. `buildNetlist` first flattens it
into primitives, expanding every custom block instance (recursively, with a depth
guard so a self-referential block cannot hang the page). Each pass then:

1. settles the combinational network to a fixed point,
2. advances free-running clocks, if a tick was requested,
3. applies edge-triggered elements **once**, from the settled inputs — so a chain
   of flip-flops shifts by exactly one stage per clock edge rather than racing
   through,
4. settles again so the new flip-flop outputs propagate.

Feedback loops are legal. Nodes that cannot be topologically ordered are iterated
to a fixed point; a circuit that never settles (a ring oscillator, say) is
reported as unstable rather than freezing the tab.

`src/utils/gateConfigs.ts` is the single source of truth for how big a gate is and
where its pins sit. Rendering, hit testing, wire routing and alignment all read
from it, so a symbol and its ports cannot drift apart.

## Layout

```
src/
  types/circuit.ts        Core types
  utils/
    gateConfigs.ts        Gate geometry — sizes, port positions, palette metadata
    simulation.ts         Netlist construction and evaluation
    truthTable.ts         Truth table enumeration + sum-of-products
    persistence.ts        Autosave, named saves, JSON import/export
    wireUtils.ts          Wire routing and connection validation
    blockUtils.ts         Building and expanding custom blocks
  components/
    CanvasEditor.tsx      The canvas: input, hit testing, render loop
    gates/gateRenderer.ts Gate symbols
    wires/wireRenderer.ts Wires, junctions, signal animation
  hooks/                  Simulation, blocks, history, selection, clipboard, viewport
```

## Licence

MIT
