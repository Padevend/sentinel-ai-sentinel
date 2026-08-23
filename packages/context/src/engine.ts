/**
 * @sentinel/context — Context Engine
 *
 * Assembles relevant contextual information (stack, files, symbols, memory)
 * without exceeding the token budget or overwhelming the LLM.
 */

import type { ContextItem, ProjectInfo } from '@sentinel/core';
import type { IndexedFile, StructuralSymbol } from '@sentinel/project';
import type { AssembledContext, ContextQuery } from './types.js';
import { RelevanceScorer } from './relevance.js';
import { TokenBudget } from './token-budget.js';

export class ContextEngine {
  constructor(
    private readonly projectInfo: ProjectInfo,
    private readonly files: readonly IndexedFile[],
    private readonly symbols: readonly StructuralSymbol[],
  ) {}

  /**
   * Builds the assembled context for an incoming user query.
   */
  assembleContext(query: ContextQuery): AssembledContext {
    const maxTokens = query.maxTokens ?? 3000;
    const scoredFiles = RelevanceScorer.scoreFiles(
      query.query,
      this.files,
      this.symbols,
      query.recentFiles ?? [],
    );

    const relevantItems: ContextItem[] = [];
    let usedTokens = 0;

    // 1. Project Info Summary
    const projectSummary = this.formatProjectSummary();
    const projTokens = TokenBudget.estimate(projectSummary);
    usedTokens += projTokens;

    // 2. High relevance files & symbols
    const topScored = scoredFiles.slice(0, 10);
    for (const item of topScored) {
      const symList = item.matchedSymbols.map((s) => `${s.kind} ${s.name} (L${s.line})`).join(', ');
      const content = `File: ${item.file.path} (${item.file.language})` + (symList ? ` [Symbols: ${symList}]` : '');
      const itemTokens = TokenBudget.estimate(content);

      if (usedTokens + itemTokens <= maxTokens) {
        relevantItems.push({
          source: item.file.path,
          content,
          relevance: item.score,
          type: 'file',
          tokenEstimate: itemTokens,
        });
        usedTokens += itemTokens;
      }
    }

    // Format prompt injection
    const promptParts: string[] = [projectSummary];

    if (relevantItems.length > 0) {
      promptParts.push('Relevant files & symbols detected for this query:');
      for (const item of relevantItems) {
        promptParts.push(`- ${item.content}`);
      }
    }

    const formattedPrompt = promptParts.join('\n\n');

    return {
      projectSummary,
      relevantItems,
      estimatedTokens: usedTokens,
      formattedPrompt,
    };
  }

  private formatProjectSummary(): string {
    const parts = [
      `Project: ${this.projectInfo.name}`,
      `Languages: ${this.projectInfo.languages.join(', ')}`,
    ];

    if (this.projectInfo.frameworks.length > 0) {
      parts.push(`Frameworks: ${this.projectInfo.frameworks.join(', ')}`);
    }

    if (this.projectInfo.packageManager) {
      parts.push(`Package Manager: ${this.projectInfo.packageManager}`);
    }

    if (this.projectInfo.testFramework) {
      parts.push(`Test Runner: ${this.projectInfo.testFramework}`);
    }

    parts.push(`Git Repository: ${this.projectInfo.hasGit ? 'yes' : 'no'}`);
    parts.push(`Total Files: ${this.projectInfo.fileCount}`);

    return parts.join('\n');
  }
}
