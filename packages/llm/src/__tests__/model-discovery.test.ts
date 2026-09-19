import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelDiscovery, OpenAIProvider, type ChatRequest, type ChatResponse, type ChatStreamChunk, type LLMProvider, type ModelInfo } from '../index.js';

function createProvider(listModels: () => Promise<readonly ModelInfo[]>): LLMProvider {
  return {
    id: 'test-provider',
    name: 'Test provider',
    modelId: 'runtime-model',
    listModels,
    supportsNativeReasoningEffort: () => false,
    chat: async (_request: ChatRequest): Promise<ChatResponse> => ({
      content: '',
      toolCalls: [],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: 'stop',
    }),
    chatStream: async function* (_request: ChatRequest): AsyncIterable<ChatStreamChunk> {
      yield { type: 'done', finishReason: 'stop' };
    },
    complete: async function* (_params): AsyncIterable<ChatStreamChunk> {
      yield { type: 'done', finishReason: 'stop' };
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('ModelDiscovery', () => {
  it('uses runtime provider data and respects the configurable TTL', async () => {
    let now = 100;
    let calls = 0;
    const provider = createProvider(async () => {
      calls++;
      return [{ id: `model-${calls}`, supportsReasoningEffort: false, raw: { calls } }];
    });
    const discovery = new ModelDiscovery({ ttlMs: 50, now: () => now });

    expect((await discovery.listModels(provider))[0]?.id).toBe('model-1');
    now += 49;
    expect((await discovery.listModels(provider))[0]?.id).toBe('model-1');
    now += 1;
    expect((await discovery.listModels(provider))[0]?.id).toBe('model-2');
    expect(calls).toBe(2);
  });

  it('lists models from an OpenAI-compatible endpoint at runtime', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('/models');
      expect(init?.headers).toEqual({ Authorization: 'Bearer secret' });
      return new Response(JSON.stringify({ data: [{ id: 'runtime-model', name: 'Runtime model' }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAIProvider({ provider: 'openai', apiKey: 'secret' });
    const models = await provider.listModels();
    expect(models).toEqual([
      expect.objectContaining({ id: 'runtime-model', displayName: 'Runtime model' }),
    ]);
  });
});
