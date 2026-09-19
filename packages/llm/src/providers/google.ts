/**
 * @sentinel/llm — Google AI Studio (Gemini) Provider
 *
 * Direct REST adapter for Google AI Studio Gemini API.
 * Supports the models exposed by the configured Google AI endpoint.
 * Supports streaming, tool calling (function declarations), token usage reporting,
 * and cancellation via AbortSignal.
 */

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

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_RETRIES = 3;

interface GeminiPart {
  text?: string;
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[];
}

interface GeminiGenerateRequest {
  contents: GeminiContent[];
  systemInstruction?: {
    parts: Array<{ text: string }>;
  };
  tools?: GeminiTool[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
}

interface GeminiCandidate {
  content?: {
    role: string;
    parts: GeminiPart[];
  };
  finishReason?: string;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiGenerateResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

export class GoogleProvider implements LLMProvider {
  readonly id = 'google';
  readonly name = 'Google AI';
  readonly modelId: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    this.modelId = config.model ?? '';
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ? config.baseUrl.replace(/\/+$/, '') : DEFAULT_BASE_URL;
  }

  async listModels(signal?: AbortSignal): Promise<readonly ModelInfo[]> {
    const url = `${this.baseUrl}/models?key=${encodeURIComponent(this.apiKey)}`;
    const response = await fetch(url, { method: 'GET', signal });
    if (!response.ok) {
      throw new ModelError(`Model listing failed for Google AI (${response.status})`, {
        code: 'MODEL_LIST_FAILED',
        retryable: response.status === 429 || response.status >= 500,
      });
    }
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload['models'])) return [];
    return payload['models'].filter(isRecord).reduce<ModelInfo[]>((models, record) => {
        const resourceName = readString(record, 'name');
        if (!resourceName) return models;
        const id = resourceName.startsWith('models/') ? resourceName.slice('models/'.length) : resourceName;
        models.push({
          id,
          displayName: readString(record, 'displayName') ?? id,
          contextLength: readNumber(record, 'inputTokenLimit'),
          supportsReasoningEffort: false,
          raw: record,
        });
        return models;
      }, []);
  }

  supportsNativeReasoningEffort(): boolean {
    return false;
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
    this.assertModelSelected();
    const url = `${this.baseUrl}/models/${this.modelId}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const body = this.buildRequestBody(request);

    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: request.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          let parsedError: { error?: { message?: string } } | null = null;
          try {
            parsedError = JSON.parse(errorText);
          } catch {
            // Ignore JSON parse error
          }
          const message = parsedError?.error?.message ?? errorText ?? `HTTP ${response.status} ${response.statusText}`;

          if (this.isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
            lastError = new Error(`HTTP ${response.status}: ${message}`);
            continue;
          }

          throw new ModelError(`Google AI API error (${response.status}): ${message}`, {
            code: `GOOGLE_API_${response.status}`,
            retryable: this.isRetryableStatus(response.status),
          });
        }

        const data = (await response.json()) as GeminiGenerateResponse;
        if (data.error) {
          throw new ModelError(`Google AI API error: ${data.error.message}`, {
            code: `GOOGLE_API_${data.error.code}`,
          });
        }

        const candidate = data.candidates?.[0];
        if (!candidate) {
          throw new ModelError('No response candidate returned from Google AI model', {
            code: 'NO_CHOICE',
          });
        }

        let content = '';
        const toolCalls: ToolCall[] = [];

        for (const part of candidate.content?.parts ?? []) {
          if (part.text) {
            content += part.text;
          }
          if (part.functionCall) {
            toolCalls.push({
              id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` as ToolCallId,
              toolName: part.functionCall.name,
              input: part.functionCall.args ?? {},
            });
          }
        }

        return {
          content,
          toolCalls,
          usage: {
            promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
            completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
            totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
          },
          finishReason: this.mapFinishReason(candidate.finishReason),
        };
      } catch (error) {
        lastError = error;
        if (error instanceof ModelError) {
          if (!error.retryable || attempt >= MAX_RETRIES) throw error;
        } else if (attempt >= MAX_RETRIES) {
          throw new ModelError(
            `Google AI request failed: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
      }
    }

    throw new ModelError(
      `Google AI request failed after retries: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      { cause: lastError },
    );
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatStreamChunk> {
    this.assertModelSelected();
    const url = `${this.baseUrl}/models/${this.modelId}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`;
    const body = this.buildRequestBody(request);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: request.signal,
      });
    } catch (error) {
      throw new ModelError(
        `Google AI streaming connection failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new ModelError(`Google AI streaming error (${response.status}): ${errorText}`, {
        code: `GOOGLE_STREAM_${response.status}`,
        retryable: this.isRetryableStatus(response.status),
      });
    }

    if (!response.body) {
      throw new ModelError('No response body returned for streaming', { code: 'NO_STREAM_BODY' });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedToolCalls: Array<{ id: string; name: string; args: string }> = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          let chunkData: GeminiGenerateResponse;
          try {
            chunkData = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (chunkData.error) {
            throw new ModelError(`Google AI stream error: ${chunkData.error.message}`, {
              code: `GOOGLE_API_${chunkData.error.code}`,
            });
          }

          const candidate = chunkData.candidates?.[0];
          if (candidate?.content?.parts) {
            for (const part of candidate.content.parts) {
              if (part.text) {
                yield { type: 'content', content: part.text };
              }
              if (part.functionCall) {
                const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                const argsStr = JSON.stringify(part.functionCall.args ?? {});
                accumulatedToolCalls.push({
                  id: callId,
                  name: part.functionCall.name,
                  args: argsStr,
                });
                yield { type: 'tool_call_start', toolCallId: callId, toolName: part.functionCall.name };
                yield { type: 'tool_call_delta', toolCallId: callId, argumentDelta: argsStr };
                yield {
                  type: 'tool_call_complete',
                  toolCallId: callId,
                  toolName: part.functionCall.name,
                  arguments: argsStr,
                };
              }
            }
          }

          if (chunkData.usageMetadata) {
            yield {
              type: 'usage',
              usage: {
                promptTokens: chunkData.usageMetadata.promptTokenCount ?? 0,
                completionTokens: chunkData.usageMetadata.candidatesTokenCount ?? 0,
                totalTokens: chunkData.usageMetadata.totalTokenCount ?? 0,
              },
            };
          }

          if (candidate?.finishReason) {
            yield { type: 'done', finishReason: this.mapFinishReason(candidate.finishReason) };
          }
        }
      }
    } catch (error) {
      if (error instanceof ModelError) throw error;
      throw new ModelError(
        `Google AI streaming error: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    } finally {
      reader.releaseLock();
    }
  }

  private assertModelSelected(): void {
    if (!this.modelId) {
      throw new ModelError('No model selected. Discover models from the configured provider first.', {
        code: 'MODEL_NOT_SELECTED',
        retryable: false,
      });
    }
  }

  // ─── Request Builder ─────────────────────────────────────────────

  private buildRequestBody(request: ChatRequest): GeminiGenerateRequest {
    const contents: GeminiContent[] = [];

    // Map messages
    let pendingToolResponses: GeminiPart[] = [];

    for (const msg of request.messages) {
      switch (msg.role) {
        case 'user':
          if (pendingToolResponses.length > 0) {
            contents.push({ role: 'user', parts: pendingToolResponses });
            pendingToolResponses = [];
          }
          contents.push({ role: 'user', parts: [{ text: msg.content }] });
          break;

        case 'assistant': {
          if (pendingToolResponses.length > 0) {
            contents.push({ role: 'user', parts: pendingToolResponses });
            pendingToolResponses = [];
          }
          const parts: GeminiPart[] = [];
          if (msg.content) {
            parts.push({ text: msg.content });
          }
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            for (const tc of msg.toolCalls) {
              const args =
                typeof tc.input === 'string'
                  ? parseToolArguments(tc.input)
                  : (tc.input as Record<string, unknown>) ?? {};
              parts.push({
                functionCall: {
                  name: tc.toolName,
                  args,
                },
              });
            }
          }
          if (parts.length > 0) {
            contents.push({ role: 'model', parts });
          }
          break;
        }

        case 'tool': {
          let responseObj: Record<string, unknown>;
          try {
            responseObj = JSON.parse(msg.content);
          } catch {
            responseObj = { output: msg.content };
          }
          pendingToolResponses.push({
            functionResponse: {
              name: msg.toolCallId ?? 'unknown_tool',
              response: responseObj,
            },
          });
          break;
        }

        case 'system':
          // Handled via systemInstruction
          break;
      }
    }

    if (pendingToolResponses.length > 0) {
      contents.push({ role: 'user', parts: pendingToolResponses });
    }

    const result: GeminiGenerateRequest = { contents };

    // System prompt
    if (request.systemPrompt) {
      result.systemInstruction = {
        parts: [{ text: request.systemPrompt }],
      };
    }

    // Tools
    if (request.tools && request.tools.length > 0) {
      result.tools = [
        {
          functionDeclarations: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          })),
        },
      ];
    }

    // Generation config
    if (request.temperature !== undefined || request.maxTokens !== undefined) {
      result.generationConfig = {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
      };
    }

    return result;
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private mapFinishReason(reason: string | undefined): ChatResponse['finishReason'] {
    switch (reason) {
      case 'STOP': return 'stop';
      case 'MAX_TOKENS': return 'length';
      case 'SAFETY': return 'content_filter';
      case 'RECITATION': return 'content_filter';
      default: return 'stop';
    }
  }

  private isRetryableStatus(status: number): boolean {
    return status === 429 || status === 500 || status === 503 || status === 504;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseToolArguments(argumentsText: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(argumentsText);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { invalidArguments: argumentsText };
  } catch {
    return { invalidArguments: argumentsText };
  }
}
