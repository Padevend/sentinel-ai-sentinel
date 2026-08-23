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
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  ProviderConfig,
} from '../types.js';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const MAX_RETRIES = 3;

export class OpenAIProvider implements LLMProvider {
  readonly name = 'OpenAI';
  readonly modelId: string;
  private readonly client: OpenAI;

  constructor(config: ProviderConfig) {
    this.modelId = config.model;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl ?? DEFAULT_BASE_URL,
      maxRetries: MAX_RETRIES,
    });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.modelId,
          messages: this.mapMessages(request),
          tools: request.tools ? this.mapTools(request.tools) : undefined,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
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
        input: JSON.parse(tc.function.arguments) as unknown,
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
      const stream = await this.client.chat.completions.create(
        {
          model: this.modelId,
          messages: this.mapMessages(request),
          tools: request.tools ? this.mapTools(request.tools) : undefined,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
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
