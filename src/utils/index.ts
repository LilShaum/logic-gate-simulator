export { getGateConfig, ALL_GATE_TYPES } from './gateConfigs';
export { generateId } from './generateId';
export {
  computeManhattanRoute,
  getWireScreenPoints,
  getWireWorldPoints,
  validateConnection,
  createWire,
  findWireAtPoint,
  getPreviewWirePoints,
} from './wireUtils';
export type { ConnectionValidation } from './wireUtils';
export { simulationStep, toggleInputGate } from './simulation';
export {
  getGatesInMarquee,
  getGateBoundingBox,
  boxesOverlap,
  isGateInMarquee,
} from './selectionUtils';
export {
  analyzeSelection,
  buildBlockDefinition,
  getBlockGateConfig,
  createBlockInstance,
  expandBlockInstance,
  isBlockInstance,
} from './blockUtils';
