/**
 * @sentinel/project — Type definitions for project indexing & structural analysis
 */

import type { AbsolutePath, ProjectInfo } from '@sentinel/core';

export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'endpoint'
  | 'react_component'
  | 'variable'
  | 'import'
  | 'export';

export interface StructuralSymbol {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly filePath: string;
  readonly line: number;
  readonly endLine: number;
  readonly details?: string;
  readonly calls?: readonly string[];
  readonly imports?: readonly string[];
}

export interface IndexedFile {
  readonly path: string;
  readonly size: number;
  readonly modifiedAt: number;
  readonly language: string;
  readonly symbols?: readonly StructuralSymbol[];
}

export interface ProjectMetadata {
  readonly info: ProjectInfo;
  readonly indexedAt: number;
  readonly totalFiles: number;
  readonly totalLines: number;
}

export interface ProjectScanResult {
  readonly info: ProjectInfo;
  readonly files: readonly IndexedFile[];
  readonly symbols: readonly StructuralSymbol[];
}
