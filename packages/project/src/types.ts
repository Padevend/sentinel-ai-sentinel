/**
 * @sentinel/project — Type definitions for project indexing & structural analysis
 */

export type KnowledgeStatus = "observed" | "inferred" | "verified";
export type EntityKind = "project" | "application" | "package" | "module" | "file" | "symbol" | "endpoint" | "component" | "hook" | "database_model" | "test";
export type RelationType = "imports" | "exports" | "calls" | "references" | "extends" | "implements" | "renders" | "uses" | "depends_on" | "tests";

export interface SourceLocation { readonly file: string; readonly startLine: number; readonly startColumn: number; readonly endLine: number; readonly endColumn: number; }
export interface KnowledgeSource { readonly type: "filesystem" | "ast" | "typescript" | "config" | "git" | "llm"; readonly file?: string; readonly location?: SourceLocation; readonly timestamp: number; }
export interface StructuralEntity { readonly id: string; readonly kind: EntityKind; readonly name: string; readonly source?: SourceLocation; readonly metadata: Readonly<Record<string, string | number | boolean | null>>; readonly status: KnowledgeStatus; readonly confidence: number; }
export interface StructuralRelation { readonly id: string; readonly sourceId: string; readonly targetId: string; readonly type: RelationType; readonly confidence: number; readonly status: KnowledgeStatus; readonly sources: readonly KnowledgeSource[]; }
export interface ProjectManifest { readonly id: string; readonly rootPath: string; readonly languages: readonly string[]; readonly frameworks: readonly string[]; readonly sourceDirectories: readonly string[]; readonly testDirectories: readonly string[]; readonly configFiles: readonly string[]; readonly entrypoints: readonly string[]; readonly scripts: Readonly<Record<string, string>>; }
export interface StructuralTwin { readonly version: 1; readonly manifest: ProjectManifest; readonly files: readonly IndexedFile[]; readonly symbols: readonly StructuralSymbol[]; readonly entities: readonly StructuralEntity[]; readonly relations: readonly StructuralRelation[]; readonly indexedAt: number; }

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
  readonly id?: string;
  readonly exported?: boolean;
  readonly status?: KnowledgeStatus;
  readonly confidence?: number;
  readonly source?: SourceLocation;
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
  readonly id?: string;
  readonly hash?: string;
  readonly isTest?: boolean;
  readonly isGenerated?: boolean;
  readonly isConfig?: boolean;
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
  readonly twin?: StructuralTwin;
  readonly info: ProjectInfo;
  readonly files: readonly IndexedFile[];
  readonly symbols: readonly StructuralSymbol[];
}
