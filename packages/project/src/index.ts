/**
 * @sentinel/project — Project Index & Structure Analysis
 *
 * Scans, indexes, and analyzes project files and architecture.
 * Extracts structural intelligence (functions, classes, interfaces, imports/exports, endpoints).
 */

export type {
  ProjectMetadata,
  IndexedFile,
  StructuralSymbol,
  SymbolKind,
  ProjectScanResult,
} from './types.js';

export { ProjectIndexer } from './indexer.js';
export { detectProjectStack } from './detectors.js';
export { StructuralAnalyzer } from './structural-analyzer.js';
