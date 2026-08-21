export { getGateConfig, ALL_GATE_TYPES } from './gateConfigs';
export { generateId } from './generateId';
export {
  computeManhattanRoute,
  computeSmartRoute,
  getWireScreenPoints,
  getWireWorldPoints,
  getWireBezierSegments,
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
export {
  computeAlignmentSnap,
  getGateWorldBBox,
  getSelectionBBox,
  distributeHorizontally,
  distributeVertically,
  alignGates,
} from './alignmentUtils';
export type { AlignmentGuide, AlignmentSnapResult, AlignDirection } from './alignmentUtils';
