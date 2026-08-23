/**
 * @sentinel/context — Relevance Scorer
 *
 * Scores files and symbols against user queries using tokenization,
 * symbol matches, path proximity, and session recency.
 */

import type { IndexedFile, StructuralSymbol } from '@sentinel/project';
import type { ScoredFile } from './types.js';

export class RelevanceScorer {
  /**
   * Scores files according to their relevance to the user's query.
   */
  static scoreFiles(
    query: string,
    files: readonly IndexedFile[],
    symbols: readonly StructuralSymbol[],
    recentFiles: readonly string[] = [],
  ): ScoredFile[] {
    const queryTokens = this.tokenize(query);
    const scored: ScoredFile[] = [];

    const symbolsByFile = new Map<string, StructuralSymbol[]>();
    for (const sym of symbols) {
      if (!symbolsByFile.has(sym.filePath)) {
        symbolsByFile.set(sym.filePath, []);
      }
      symbolsByFile.get(sym.filePath)!.push(sym);
    }

    for (const file of files) {
      let score = 0;
      const fileLower = file.path.toLowerCase();
      const fileSymbols = symbolsByFile.get(file.path) ?? [];
      const matchedSymbols: StructuralSymbol[] = [];

      // 1. Direct path mentions
      for (const token of queryTokens) {
        if (fileLower.includes(token)) {
          score += 15;
        }
      }

      // 2. Structural symbol matches
      for (const sym of fileSymbols) {
        const symLower = sym.name.toLowerCase();
        for (const token of queryTokens) {
          if (symLower === token) {
            score += 25;
            matchedSymbols.push(sym);
          } else if (symLower.includes(token) && token.length > 2) {
            score += 10;
            matchedSymbols.push(sym);
          }
        }
      }

      // 3. Recency boost
      if (recentFiles.includes(file.path)) {
        score += 20;
      }

      // 4. Key project files bonus (entrypoints, routes, configs)
      if (fileLower.includes('route') || fileLower.includes('controller') || fileLower.includes('api')) {
        score += 5;
      }
      if (fileLower === 'package.json' || fileLower.includes('index.') || fileLower.includes('main.') || fileLower.includes('app.')) {
        score += 3;
      }

      if (score > 0) {
        scored.push({
          file,
          score,
          matchedSymbols,
        });
      }
    }

    return scored.sort((a, b) => b.score - a.score);
  }

  private static tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-zA-Z0-9_$@./-]+/)
      .filter((t) => t.length > 1);
  }
}
