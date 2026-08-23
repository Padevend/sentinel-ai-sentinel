/**
 * @sentinel/llm — Provider Registry
 *
 * Factory for creating LLM providers from configuration.
 * Supports Google AI (Gemini), Anthropic (Claude), OpenAI, and custom OpenAI-compatible endpoints.
 */

import { ConfigurationError } from '@sentinel/core';
import type { ResolvedConfig } from '@sentinel/core';
import type { LLMProvider, ProviderConfig } from './types.js';
import { GoogleProvider } from './providers/google.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';

type ProviderFactory = (config: ProviderConfig) => LLMProvider;

/**
 * Registry of known provider factories.
 * New providers can be registered at runtime.
 */
export class ProviderRegistry {
  private readonly factories = new Map<string, ProviderFactory>();

  constructor() {
    // Register built-in providers
    this.register('google', (config) => new GoogleProvider(config));
    this.register('gemini', (config) => new GoogleProvider(config));
    this.register('openai', (config) => new OpenAIProvider(config));
    this.register('anthropic', (config) => new AnthropicProvider(config));
    this.register('custom', (config) => new OpenAIProvider(config));
  }

  /**
   * Register a new provider factory.
   */
  register(name: string, factory: ProviderFactory): void {
    this.factories.set(name.toLowerCase(), factory);
  }

  /**
   * Create a provider instance from configuration.
   */
  create(config: ProviderConfig): LLMProvider {
    const factory = this.factories.get(config.provider.toLowerCase());
    if (!factory) {
      // Fall back to OpenAI-compatible if a baseUrl is set or if provider is custom
      if (config.baseUrl || config.provider.toLowerCase() === 'custom') {
        return new OpenAIProvider(config);
      }
      throw new ConfigurationError(
        `Unknown LLM provider: "${config.provider}". Available: ${[...this.factories.keys()].join(', ')}. ` +
        `Set baseUrl to use a custom OpenAI-compatible endpoint.`,
        { code: 'UNKNOWN_PROVIDER' },
      );
    }
    return factory(config);
  }

  /**
   * List all registered provider names.
   */
  list(): string[] {
    return [...this.factories.keys()];
  }
}

// ─── Convenience factory ─────────────────────────────────────────

/**
 * Create an LLM provider from Sentinel's resolved configuration.
 * This is the primary way the agent kernel obtains a provider.
 */
export function createProvider(resolvedConfig: ResolvedConfig): LLMProvider {
  const registry = new ProviderRegistry();
  const modelConfig = resolvedConfig.config.model;

  const providerConfig: ProviderConfig = {
    provider: modelConfig.provider,
    model: modelConfig.model,
    apiKey: resolvedConfig.secrets.apiKey,
    baseUrl: modelConfig.baseUrl,
    maxTokens: modelConfig.maxTokens,
    temperature: modelConfig.temperature,
  };

  return registry.create(providerConfig);
}
