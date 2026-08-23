/**
 * @sentinel/llm — Anthropic Provider
 *
 * Adapter for Anthropic Claude models. Maps Claude's message format
 * (with content blocks and tool_use) to Sentinel's unified interface.
 */

import Anthropic from '@anthropic-ai/sdk';
import { ModelError } from '@sentinel/core';
import type { Message, ToolDefinition, ToolCall, ToolCallId, TokenUsage } from '@sentinel/core';
import type {
  LLMProvider,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  ProviderConfig,
} from '../types.js';

const MAX_RETRIES = 3;

export class AnthropicProvider implements LLMProvider {
  readonly name = 'Anthropic';
  readonly modelId: string;
  private readonly client: Anthropic;

  constructor(config: ProviderConfig) {
    this.modelId = config.model;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      maxRetries: MAX_RETRIES,
    });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      const response = await this.client.messages.create(
        {
          model: this.modelId,
          system: request.systemPrompt ?? '',
          messages: this.mapMessages(request),
          tools: request.tools ? this.mapTools(request.tools) : undefined,
          max_tokens: request.maxTokens ?? 4096,
          temperature: request.temperature,
        },
      );

      let content = '';
      const toolCalls: ToolCall[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          content += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id as ToolCallId,
            toolName: block.name,
            input: block.input,
          });
        }
      }

      return {
        content,
        toolCalls,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        finishReason: this.mapStopReason(response.stop_reason),
      };
    } catch (error) {
      if (error instanceof ModelError) throw error;
      throw new ModelError(
        `Anthropic API error: ${error instanceof Error ? error.message : String(error)}`,
        {
          retryable: this.isRetryable(error),
          cause: error,
        },
      );
    }
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatStreamChunk> {
    try {
      const stream = this.client.messages.stream({
        model: this.modelId,
        system: request.systemPrompt ?? '',
        messages: this.mapMessages(request),
        tools: request.tools ? this.mapTools(request.tools) : undefined,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature,
      });

      // Track current tool use block
      let currentToolId = '';
      let currentToolName = '';
      let currentToolArgs = '';

      for await (const event of stream) {
        switch (event.type) {
          case 'content_block_start':
            if (event.content_block.type === 'tool_use') {
              currentToolId = event.content_block.id;
              currentToolName = event.content_block.name;
              currentToolArgs = '';
              yield { type: 'tool_call_start', toolCallId: currentToolId, toolName: currentToolName };
            }
            break;

          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              yield { type: 'content', content: event.delta.text };
            } else if (event.delta.type === 'input_json_delta') {
              currentToolArgs += event.delta.partial_json;
              yield { type: 'tool_call_delta', toolCallId: currentToolId, argumentDelta: event.delta.partial_json };
            }
            break;

          case 'content_block_stop':
            if (currentToolId) {
              yield {
                type: 'tool_call_complete',
                toolCallId: currentToolId,
                toolName: currentToolName,
                arguments: currentToolArgs,
              };
              currentToolId = '';
              currentToolName = '';
              currentToolArgs = '';
            }
            break;

          case 'message_delta':
            if (event.usage) {
              yield {
                type: 'usage',
                usage: {
                  promptTokens: 0,
                  completionTokens: event.usage.output_tokens,
                  totalTokens: event.usage.output_tokens,
                },
              };
            }
            yield { type: 'done', finishReason: this.mapStopReason(event.delta.stop_reason) };
            break;
        }
      }

      // Get final message for full usage stats
      const finalMessage = await stream.finalMessage();
      yield {
        type: 'usage',
        usage: {
          promptTokens: finalMessage.usage.input_tokens,
          completionTokens: finalMessage.usage.output_tokens,
          totalTokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
        },
      };
    } catch (error) {
      if (error instanceof ModelError) throw error;
      throw new ModelError(
        `Anthropic streaming error: ${error instanceof Error ? error.message : String(error)}`,
        {
          retryable: this.isRetryable(error),
          cause: error,
        },
      );
    }
  }

  // ─── Message mapping ────────────────────────────────────────────

  private mapMessages(request: ChatRequest): Anthropic.MessageParam[] {
    const messages: Anthropic.MessageParam[] = [];

    for (const msg of request.messages) {
      switch (msg.role) {
        case 'user':
          messages.push({ role: 'user', content: msg.content });
          break;

        case 'assistant': {
          const content: Anthropic.ContentBlockParam[] = [];
          if (msg.content) {
            content.push({ type: 'text', text: msg.content });
          }
          if (msg.toolCalls) {
            for (const tc of msg.toolCalls) {
              content.push({
                type: 'tool_use',
                id: tc.id,
                name: tc.toolName,
                input: tc.input as Record<string, unknown>,
              });
            }
          }
          messages.push({ role: 'assistant', content });
          break;
        }

        case 'tool':
          messages.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: msg.toolCallId ?? '',
              content: msg.content,
            }],
          });
          break;

        // system messages are handled separately via the system parameter
        case 'system':
          break;
      }
    }

    return messages;
  }

  // ─── Tool mapping ───────────────────────────────────────────────

  private mapTools(tools: readonly ToolDefinition[]): Anthropic.Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    }));
  }

  // ─── Stop reason mapping ───────────────────────────────────────

  private mapStopReason(reason: string | null): ChatResponse['finishReason'] {
    switch (reason) {
      case 'end_turn': return 'stop';
      case 'tool_use': return 'tool_calls';
      case 'max_tokens': return 'length';
      default: return 'stop';
    }
  }

  // ─── Retry logic ───────────────────────────────────────────────

  private isRetryable(error: unknown): boolean {
    if (error instanceof Anthropic.APIError) {
      return error.status === 429 || (error.status !== undefined && error.status >= 500);
    }
    return false;
  }
}
