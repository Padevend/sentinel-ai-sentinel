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

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'max';

export type ChatMessage = Message;

export interface CompletionParams {
  readonly modelId: string;
  readonly messages: readonly ChatMessage[];
  readonly tools?: readonly ToolDefinition[];
  readonly reasoningEffort?: ReasoningEffort;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly signal?: AbortSignal;
  readonly systemPrompt?: string;
}

export interface ModelInfo {
  readonly id: string;
  readonly displayName?: string;
  readonly contextLength?: number;
  readonly supportsReasoningEffort: boolean;
  readonly raw: unknown;
}

export type StreamEvent = ChatStreamChunk;

export interface ModelProvider {
  readonly id: string;
  listModels(signal?: AbortSignal): Promise<readonly ModelInfo[]>;
  complete(params: CompletionParams): AsyncIterable<StreamEvent>;
  supportsNativeReasoningEffort(): boolean;
}

// ─── Provider Interface ──────────────────────────────────────────

/**
 * The contract every LLM adapter must implement.
 * Supports both blocking and streaming modes, tool calling,
 * cancellation, and token usage reporting.
 */
export interface LLMProvider extends ModelProvider {
  /** Stable provider identifier used by configuration and policy routing. */
  readonly id: string;

  /** Human-readable provider name supplied by the adapter. */
  readonly name: string;

  /** Specific model identifier returned by the provider listing endpoint. */
  readonly modelId: string;

  /** Discover models exposed by the configured provider endpoint. */
  listModels(signal?: AbortSignal): Promise<readonly ModelInfo[]>;

  /** Contract-compatible streaming completion entry point. */
  complete(params: CompletionParams): AsyncIterable<StreamEvent>;

  /** Whether this provider can receive a native reasoning-effort parameter. */
  supportsNativeReasoningEffort(): boolean;

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
  readonly reasoningEffort?: ReasoningEffort;
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
  readonly model?: string;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
}
