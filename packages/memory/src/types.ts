/**
 * @sentinel/memory — Types for session, project, and tool memory
 */

import type { SessionId, ToolResult } from '@sentinel/core';

export interface MemoryFact {
  readonly id: string;
  readonly category: 'user_preference' | 'task_context' | 'test_failure' | 'decision' | 'observation';
  readonly content: string;
  readonly timestamp: number;
}

export interface ToolHistoryEntry {
  readonly toolName: string;
  readonly input: unknown;
  readonly resultSummary: string;
  readonly success: boolean;
  readonly timestamp: number;
}

export interface SessionMemoryState {
  readonly sessionId: SessionId;
  readonly workingFiles: readonly string[];
  readonly facts: readonly MemoryFact[];
  readonly recentErrors: readonly string[];
  readonly activeGoal?: string;
}
