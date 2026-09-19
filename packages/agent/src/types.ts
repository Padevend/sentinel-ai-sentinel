/**
 * @sentinel/agent — Types for Agent Kernel, Session, and Verification
 */

import type { SessionId, AgentState, AgentStateSnapshot, Message, ToolCall, ToolResult, PermissionLevel } from '@sentinel/core';
import type { LLMProvider, ReasoningEffort } from '@sentinel/llm';
import type { ToolRegistry } from '@sentinel/tools';
import type { ContextEngine } from '@sentinel/context';
import type { MemoryEngine } from '@sentinel/memory';
import type { PermissionManager, PermissionRequest } from '@sentinel/permissions';
import type { SkillsEngine } from '@sentinel/skills';

export interface AgentKernelConfig {
  readonly projectRoot: string;
  readonly provider: LLMProvider;
  readonly tools: ToolRegistry;
  readonly permissions: PermissionManager;
  readonly contextEngine?: ContextEngine;
  readonly memoryEngine?: MemoryEngine;
  readonly maxIterations?: number;
  readonly contextTokenBudget?: number;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly reasoningEffort?: ReasoningEffort;
  readonly skillsEngine?: SkillsEngine;
  readonly persistSession?: (session: import('./session.js').AgentSession) => Promise<void>;
}

export interface RunOptions {
  readonly signal?: AbortSignal;
  readonly autoVerify?: boolean;
  readonly reasoningEffort?: ReasoningEffort;
  readonly stream?: boolean;
}

export interface AgentStepResult {
  readonly state: AgentState;
  readonly finalResponse: string;
  readonly toolResults: readonly ToolResult[];
  readonly iterations: number;
}

export type UserInput = string;

export type AgentEvent =
  | { readonly type: 'text_delta'; readonly content: string }
  | { readonly type: 'tool_call_requested'; readonly call: ToolCall }
  | { readonly type: 'tool_call_result'; readonly result: ToolResult }
  | { readonly type: 'permission_required'; readonly request: PermissionRequest }
  | { readonly type: 'session_state'; readonly snapshot: AgentStateSnapshot }
  | { readonly type: 'error'; readonly error: Error };

export interface AgentRun extends AsyncIterable<AgentEvent>, PromiseLike<AgentStepResult> {
  readonly sessionId: SessionId;
}

export interface VerificationResult {
  readonly passed: boolean;
  readonly output: string;
  readonly failedTests?: readonly string[];
  readonly suggestedFix?: string;
}
