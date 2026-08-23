/**
 * @sentinel/memory — Session Memory
 *
 * Tracks short-term context during an active session:
 * - Files visited / edited
 * - Key decisions made
 * - Errors encountered and test failures
 * - User preferences stated in current conversation
 */

import type { SessionId } from '@sentinel/core';
import type { MemoryFact, SessionMemoryState } from './types.js';

export class SessionMemory {
  private readonly workingFiles = new Set<string>();
  private readonly facts: MemoryFact[] = [];
  private readonly recentErrors: string[] = [];
  private activeGoal?: string;

  constructor(public readonly sessionId: SessionId) {}

  addWorkingFile(filePath: string): void {
    this.workingFiles.add(filePath);
  }

  addFact(category: MemoryFact['category'], content: string): void {
    this.facts.push({
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      category,
      content,
      timestamp: Date.now(),
    });
  }

  addError(error: string): void {
    this.recentErrors.push(error);
    if (this.recentErrors.length > 10) {
      this.recentErrors.shift();
    }
  }

  setActiveGoal(goal: string): void {
    this.activeGoal = goal;
  }

  getState(): SessionMemoryState {
    return {
      sessionId: this.sessionId,
      workingFiles: Array.from(this.workingFiles),
      facts: [...this.facts],
      recentErrors: [...this.recentErrors],
      activeGoal: this.activeGoal,
    };
  }

  formatContext(): string {
    const lines: string[] = [];

    if (this.activeGoal) {
      lines.push(`Active Goal: ${this.activeGoal}`);
    }

    if (this.workingFiles.size > 0) {
      lines.push(`Recently accessed files: ${Array.from(this.workingFiles).join(', ')}`);
    }

    if (this.facts.length > 0) {
      lines.push('Session facts:');
      for (const fact of this.facts.slice(-5)) {
        lines.push(`- [${fact.category}] ${fact.content}`);
      }
    }

    if (this.recentErrors.length > 0) {
      lines.push(`Recent errors/test failures: ${this.recentErrors.slice(-3).join(' | ')}`);
    }

    return lines.join('\n');
  }
}
