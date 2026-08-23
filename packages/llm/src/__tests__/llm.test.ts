import { describe, it, expect } from 'vitest';
import {
  ProviderRegistry,
  createProvider,
  getAvailableModels,
  getDefaultModelForProvider,
  GoogleProvider,
  OpenAIProvider,
  AnthropicProvider,
  PROVIDERS,
} from '../index.js';

describe('@sentinel/llm', () => {
  it('should list all supported providers in the catalog', () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(ids).toContain('google');
    expect(ids).toContain('openai');
    expect(ids).toContain('anthropic');
    expect(ids).toContain('custom');
  });

  it('should return recent models for Google AI', () => {
    const googleModels = getAvailableModels('google');
    const modelIds = googleModels.map((m) => m.id);
    expect(modelIds).toContain('gemini-2.5-flash');
    expect(modelIds).toContain('gemini-2.5-pro');
    expect(modelIds).toContain('gemini-2.0-flash');
    expect(getDefaultModelForProvider('google')).toBe('gemini-2.5-flash');
  });

  it('should return recent models for OpenAI and Anthropic', () => {
    const openaiModels = getAvailableModels('openai');
    expect(openaiModels.map((m) => m.id)).toContain('gpt-4o');
    expect(openaiModels.map((m) => m.id)).toContain('o3-mini');

    const anthropicModels = getAvailableModels('anthropic');
    expect(anthropicModels.map((m) => m.id)).toContain('claude-3-7-sonnet-20250219');
    expect(anthropicModels.map((m) => m.id)).toContain('claude-3-5-sonnet-20241022');
  });

  it('should create a GoogleProvider by default via createProvider', () => {
    const provider = createProvider({
      config: {
        model: {
          provider: 'google',
          model: 'gemini-2.5-flash',
        },
        permissions: {
          defaultLevel: 'confirm_recommended',
          overrides: [],
          allowedCommands: [],
          blockedCommands: [],
        },
        agent: {
          maxIterations: 25,
          maxVerificationRetries: 3,
          streamResponses: true,
        },
        logging: {
          level: 'info',
        },
        privacy: {
          sensitivePatterns: [],
        },
      },
      secrets: {
        apiKey: 'test-key',
      },
      projectRoot: process.cwd(),
      settingsPath: '/dummy/path',
    });

    expect(provider).toBeInstanceOf(GoogleProvider);
    expect(provider.name).toBe('Google AI');
    expect(provider.modelId).toBe('gemini-2.5-flash');
  });

  it('should support OpenAI and Anthropic creation via registry', () => {
    const registry = new ProviderRegistry();

    const openai = registry.create({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'test-key',
    });
    expect(openai).toBeInstanceOf(OpenAIProvider);

    const anthropic = registry.create({
      provider: 'anthropic',
      model: 'claude-3-7-sonnet-20250219',
      apiKey: 'test-key',
    });
    expect(anthropic).toBeInstanceOf(AnthropicProvider);
  });
});
