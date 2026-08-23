/**
 * @sentinel/agent — Types for Agent Kernel, Session, and Verification
 */

import type { SessionId, AgentState, Message, ToolResult, PermissionLevel } from '@sentinel/core';
import type { LLMProvider } from '@sentinel/llm';
import type { ToolRegistry } from '@sentinel/tools';
import type { ContextEngine } from '@sentinel/context';
import type { MemoryEngine } from '@sentinel/memory';
import type { PermissionManager } from '@sentinel/permissions';

export interface AgentKernelConfig {
  readonly projectRoot: string;
  readonly provider: LLMProvider;
  readonly tools: ToolRegistry;
  readonly permissions: PermissionManager;
  readonly contextEngine?: ContextEngine;
  readonly memoryEngine?: MemoryEngine;
  readonly maxIterations?: number;
}

export interface RunOptions {
  readonly signal?: AbortSignal;
  readonly autoVerify?: boolean;
}

export interface AgentStepResult {
  readonly state: AgentState;
  readonly finalResponse: string;
  readonly toolResults: readonly ToolResult[];
  readonly iterations: number;
}

export interface VerificationResult {
  readonly passed: boolean;
  readonly output: string;
  readonly failedTests?: readonly string[];
  readonly suggestedFix?: string;
}
