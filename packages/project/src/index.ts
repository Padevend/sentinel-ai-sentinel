/**
 * @sentinel/project — Project Index & Structure Analysis
 *
 * Scans, indexes, and analyzes project files and architecture.
 * Extracts structural intelligence (functions, classes, interfaces, imports/exports, endpoints).
 * Provides project root detection and persistent project identity.
 */

export type {
  ProjectMetadata,
  IndexedFile,
  StructuralSymbol,
  SymbolKind,
  ProjectScanResult,
  StructuralTwin,
  StructuralEntity,
  StructuralRelation,
  ProjectManifest,
  SourceLocation,
  KnowledgeSource,
  KnowledgeStatus,
  EntityKind,
  RelationType,
} from './types.js';

export { ProjectIndexer } from './indexer.js';
export { detectProjectStack } from './detectors.js';
export { StructuralAnalyzer } from './structural-analyzer.js';
export { ProjectDetector } from './detector.js';
export { ProjectIdentityService } from './identity.js';
export { StructuralTwinBuilder, StructuralTwinQuery } from "./structural-twin.js";
export { StaticPreAnalyzer } from './pre-analysis.js';
export type { PreAnalysisResult } from './pre-analysis.js';
