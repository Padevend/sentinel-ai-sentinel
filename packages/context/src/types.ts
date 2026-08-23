/**
 * @sentinel/context — Types for context engine and relevance scoring
 */

import type { ContextItem, ProjectInfo } from '@sentinel/core';
import type { IndexedFile, StructuralSymbol } from '@sentinel/project';

export interface ContextQuery {
  readonly query: string;
  readonly recentFiles?: readonly string[];
  readonly maxTokens?: number;
}

export interface AssembledContext {
  readonly projectSummary: string;
  readonly relevantItems: readonly ContextItem[];
  readonly estimatedTokens: number;
  readonly formattedPrompt: string;
}

export interface ScoredFile {
  readonly file: IndexedFile;
  readonly score: number;
  readonly matchedSymbols: readonly StructuralSymbol[];
}
