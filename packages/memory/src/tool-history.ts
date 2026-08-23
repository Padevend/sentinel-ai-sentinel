/**
 * @sentinel/memory — Tool History
 *
 * Keeps a condensed summary of tool executions during a session.
 * Prevents repeating failed operations and provides execution history context.
 */

import type { ToolHistoryEntry } from './types.js';

export class ToolHistory {
  private readonly history: ToolHistoryEntry[] = [];

  record(toolName: string, input: unknown, resultSummary: string, success: boolean): void {
    this.history.push({
      toolName,
      input,
      resultSummary: resultSummary.slice(0, 300), // condensed
      success,
      timestamp: Date.now(),
    });
  }

  getRecent(limit = 10): ToolHistoryEntry[] {
    return this.history.slice(-limit);
  }

  formatRecent(limit = 5): string {
    if (this.history.length === 0) return '';
    return this.history
      .slice(-limit)
      .map((h) => `${h.success ? '✓' : '✗'} [${h.toolName}] -> ${h.resultSummary.replace(/\n/g, ' ')}`)
      .join('\n');
  }
}
