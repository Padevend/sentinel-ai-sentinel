/**
 * @sentinel/llm — Core types for LLM provider abstraction
 *
 * These interfaces define the contract that every model adapter must fulfill.
 * The agent kernel depends only on these types, never on a specific SDK.
 */

import type {
  Message,
  ToolDefinition,
  ToolCall,
  TokenUsage,
  FinishReason,
} from '@sentinel/core';

// ─── Provider Interface ──────────────────────────────────────────

/**
 * The contract every LLM adapter must implement.
 * Supports both blocking and streaming modes, tool calling,
 * cancellation, and token usage reporting.
 */
export interface LLMProvider {
  /** Human-readable provider name (e.g. "OpenAI", "Anthropic") */
  readonly name: string;

  /** Specific model identifier (e.g. "gpt-4o", "claude-sonnet-4-20250514") */
  readonly modelId: string;

  /** Blocking chat completion */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /** Streaming chat completion — yields content chunks and tool calls */
  chatStream(request: ChatRequest): AsyncIterable<ChatStreamChunk>;
}

// ─── Request / Response ──────────────────────────────────────────

export interface ChatRequest {
  readonly messages: readonly Message[];
  readonly tools?: readonly ToolDefinition[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly signal?: AbortSignal;
  readonly systemPrompt?: string;
}

export interface ChatResponse {
  readonly content: string;
  readonly toolCalls: readonly ToolCall[];
  readonly usage: TokenUsage;
  readonly finishReason: FinishReason;
}

// ─── Streaming ───────────────────────────────────────────────────

export type ChatStreamChunk =
  | ContentChunk
  | ToolCallStartChunk
  | ToolCallDeltaChunk
  | ToolCallCompleteChunk
  | UsageChunk
  | DoneChunk;

export interface ContentChunk {
  readonly type: 'content';
  readonly content: string;
}

export interface ToolCallStartChunk {
  readonly type: 'tool_call_start';
  readonly toolCallId: string;
  readonly toolName: string;
}

export interface ToolCallDeltaChunk {
  readonly type: 'tool_call_delta';
  readonly toolCallId: string;
  readonly argumentDelta: string;
}

export interface ToolCallCompleteChunk {
  readonly type: 'tool_call_complete';
  readonly toolCallId: string;
  readonly toolName: string;
  readonly arguments: string;
}

export interface UsageChunk {
  readonly type: 'usage';
  readonly usage: TokenUsage;
}

export interface DoneChunk {
  readonly type: 'done';
  readonly finishReason: FinishReason;
}

// ─── Provider Configuration ─────────────────────────────────────

export interface ProviderConfig {
  readonly provider: string;
  readonly model: string;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
}
