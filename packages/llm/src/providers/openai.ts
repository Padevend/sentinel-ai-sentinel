/**
 * @sentinel/llm — OpenAI Provider
 *
 * Adapter for OpenAI-compatible APIs (OpenAI, OpenRouter, Azure, local inference).
 * Supports streaming, tool calling, retry with exponential backoff,
 * and cancellation via AbortSignal.
 *
 * Because it targets the OpenAI API format, any OpenAI-compatible endpoint
 * (set via SENTINEL_BASE_URL) works without code changes.
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { ModelError } from '@sentinel/core';
import type { Message, ToolDefinition, ToolCall, ToolCallId, TokenUsage } from '@sentinel/core';
import type {
  LLMProvider,
  CompletionParams,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  ProviderConfig,
  ModelInfo,
} from '../types.js';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
const MAX_RETRIES = 3;

export class OpenAIProvider implements LLMProvider {
  readonly id: string;
  readonly name: string;
  readonly modelId: string;
  private readonly client: OpenAI;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    this.id = config.provider.toLowerCase();
    this.name = this.id === 'openrouter' ? 'OpenRouter' : this.id === 'ollama' ? 'Ollama' : this.id === 'custom' ? 'Custom OpenAI-compatible' : 'OpenAI';
    this.modelId = config.model ?? '';
    this.apiKey = config.apiKey;
    const configuredBaseUrl = config.baseUrl?.replace(/\/+$/, '');
    if (configuredBaseUrl) {
      this.baseUrl = configuredBaseUrl;
    } else if (this.id === 'openrouter') {
      this.baseUrl = DEFAULT_OPENROUTER_BASE_URL;
    } else if (this.id === 'ollama') {
      this.baseUrl = `${DEFAULT_OLLAMA_BASE_URL}/v1`;
    } else {
      this.baseUrl = DEFAULT_BASE_URL;
    }
    this.client = new OpenAI({
      // The SDK requires a non-empty constructor value even for local or
      // public model-listing endpoints. Listing itself never sends this value
      // when the user did not configure credentials.
      apiKey: config.apiKey || 'sentinel-no-auth',
      baseURL: this.baseUrl,
      maxRetries: MAX_RETRIES,
    });
  }

  async listModels(signal?: AbortSignal): Promise<readonly ModelInfo[]> {
    if (this.id === 'ollama') {
      return this.listOllamaModels(signal);
    }

    const response = await fetch(`${this.baseUrl}/models`, {
      method: 'GET',
      headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined,
      signal,
    });
    if (!response.ok) {
      throw new ModelError(`Model listing failed for ${this.name} (${response.status})`, {
        code: 'MODEL_LIST_FAILED',
        retryable: response.status === 429 || response.status >= 500,
      });
    }

    const payload: unknown = await response.json();
    const records = extractModelRecords(payload);
    return records.reduce<ModelInfo[]>((models, record) => {
        const id = readString(record, 'id');
        if (!id) return models;
        models.push({
          id,
          displayName: readString(record, 'name') ?? id,
          contextLength: readNumber(record, 'context_length') ?? readNumber(record, 'contextWindow'),
          supportsReasoningEffort: this.supportsNativeReasoningEffort(),
          raw: record,
        });
        return models;
      }, []);
  }

  supportsNativeReasoningEffort(): boolean {
    return this.id === 'openai';
  }

  complete(params: CompletionParams): AsyncIterable<ChatStreamChunk> {
    return this.chatStream({
      messages: params.messages,
      tools: params.tools,
      reasoningEffort: params.reasoningEffort,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
      signal: params.signal,
      systemPrompt: params.systemPrompt,
    });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      this.assertModelSelected();
      const response = await this.client.chat.completions.create(
        {
          model: this.modelId,
          messages: this.mapMessages(request),
          tools: request.tools ? this.mapTools(request.tools) : undefined,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          reasoning_effort: this.mapReasoningEffort(request),
        },
        { signal: request.signal },
      );

      const choice = response.choices[0];
      if (!choice) {
        throw new ModelError('No response choice returned from model', {
          code: 'NO_CHOICE',
        });
      }

      const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map((tc) => ({
        id: tc.id as ToolCallId,
        toolName: tc.function.name,
        input: parseToolArguments(tc.function.arguments),
      }));

      return {
        content: choice.message.content ?? '',
        toolCalls,
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
        finishReason: this.mapFinishReason(choice.finish_reason),
      };
    } catch (error) {
      if (error instanceof ModelError) throw error;
      throw new ModelError(
        `OpenAI API error: ${error instanceof Error ? error.message : String(error)}`,
        {
          retryable: this.isRetryable(error),
          cause: error,
        },
      );
    }
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatStreamChunk> {
    try {
      this.assertModelSelected();
      const stream = await this.client.chat.completions.create(
        {
          model: this.modelId,
          messages: this.mapMessages(request),
          tools: request.tools ? this.mapTools(request.tools) : undefined,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          reasoning_effort: this.mapReasoningEffort(request),
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal: request.signal },
      );

      // Track tool call accumulation during streaming
      const toolCallAccumulators = new Map<number, { id: string; name: string; args: string }>();

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          yield { type: 'content', content: delta.content };
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;

            if (tc.id) {
              // New tool call started
              toolCallAccumulators.set(idx, { id: tc.id, name: tc.function?.name ?? '', args: '' });
              yield { type: 'tool_call_start', toolCallId: tc.id, toolName: tc.function?.name ?? '' };
            }

            if (tc.function?.arguments) {
              const acc = toolCallAccumulators.get(idx);
              if (acc) {
                acc.args += tc.function.arguments;
                yield { type: 'tool_call_delta', toolCallId: acc.id, argumentDelta: tc.function.arguments };
              }
            }
          }
        }

        // Check for finish
        const finishReason = chunk.choices[0]?.finish_reason;
        if (finishReason) {
          // Emit completed tool calls
          for (const [, acc] of toolCallAccumulators) {
            yield {
              type: 'tool_call_complete',
              toolCallId: acc.id,
              toolName: acc.name,
              arguments: acc.args,
            };
          }

          yield { type: 'done', finishReason: this.mapFinishReason(finishReason) };
        }

        // Usage info (sent in final chunk with stream_options)
        if (chunk.usage) {
          yield {
            type: 'usage',
            usage: {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            },
          };
        }
      }
    } catch (error) {
      if (error instanceof ModelError) throw error;
      throw new ModelError(
        `OpenAI streaming error: ${error instanceof Error ? error.message : String(error)}`,
        {
          retryable: this.isRetryable(error),
          cause: error,
        },
      );
    }
  }

  // ─── Message mapping ────────────────────────────────────────────

  private mapMessages(request: ChatRequest): ChatCompletionMessageParam[] {
    const messages: ChatCompletionMessageParam[] = [];

    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    for (const msg of request.messages) {
      switch (msg.role) {
        case 'user':
          messages.push({ role: 'user', content: msg.content });
          break;
        case 'assistant':
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            messages.push({
              role: 'assistant',
              content: msg.content || null,
              tool_calls: msg.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function' as const,
                function: {
                  name: tc.toolName,
                  arguments: typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input),
                },
              })),
            });
          } else {
            messages.push({ role: 'assistant', content: msg.content });
          }
          break;
        case 'tool':
          messages.push({
            role: 'tool',
            content: msg.content,
            tool_call_id: msg.toolCallId ?? '',
          });
          break;
        case 'system':
          messages.push({ role: 'system', content: msg.content });
          break;
      }
    }

    return messages;
  }

  private mapReasoningEffort(request: ChatRequest): 'low' | 'medium' | 'high' | undefined {
    if (!request.reasoningEffort || !this.supportsNativeReasoningEffort()) return undefined;
    return request.reasoningEffort === 'max' ? 'high' : request.reasoningEffort;
  }

  private assertModelSelected(): void {
    if (!this.modelId) {
      throw new ModelError('No model selected. Discover models from the configured provider first.', {
        code: 'MODEL_NOT_SELECTED',
        retryable: false,
      });
    }
  }

  private async listOllamaModels(signal?: AbortSignal): Promise<readonly ModelInfo[]> {
    const root = this.baseUrl.endsWith('/v1') ? this.baseUrl.slice(0, -3) : this.baseUrl;
    const response = await fetch(`${root}/api/tags`, { method: 'GET', signal });
    if (!response.ok) {
      throw new ModelError(`Model listing failed for Ollama (${response.status})`, {
        code: 'MODEL_LIST_FAILED',
        retryable: response.status >= 500,
      });
    }
    const payload: unknown = await response.json();
    const models = isRecord(payload) && Array.isArray(payload['models']) ? payload['models'] : [];
    return models.filter(isRecord).reduce<ModelInfo[]>((result, record) => {
        const id = readString(record, 'name');
        if (!id) return result;
        result.push({
          id,
          displayName: id,
          contextLength: readNumber(record, 'context_length'),
          supportsReasoningEffort: false,
          raw: record,
        });
        return result;
      }, []);
  }

  // ─── Tool mapping ───────────────────────────────────────────────

  private mapTools(tools: readonly ToolDefinition[]): ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  // ─── Finish reason mapping ─────────────────────────────────────

  private mapFinishReason(reason: string | null): ChatResponse['finishReason'] {
    switch (reason) {
      case 'stop': return 'stop';
      case 'tool_calls': return 'tool_calls';
      case 'length': return 'length';
      case 'content_filter': return 'content_filter';
      default: return 'stop';
    }
  }

  // ─── Retry logic ───────────────────────────────────────────────

  private isRetryable(error: unknown): boolean {
    if (error instanceof OpenAI.APIError) {
      // Rate limit or server errors are retryable
      return error.status === 429 || (error.status !== undefined && error.status >= 500);
    }
    // Network errors are retryable
    if (error instanceof TypeError && 'cause' in error) {
      return true;
    }
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractModelRecords(value: unknown): readonly Record<string, unknown>[] {
  if (!isRecord(value) || !Array.isArray(value['data'])) return [];
  return value['data'].filter(isRecord);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseToolArguments(argumentsText: string): unknown {
  try {
    return JSON.parse(argumentsText) as unknown;
  } catch {
    return argumentsText;
  }
}
