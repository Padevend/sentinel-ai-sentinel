/**
 * Provider metadata only.
 *
 * Model identifiers intentionally do not live in source code. The active
 * provider is queried at runtime through LLMProvider.listModels().
 */

import type { ModelInfo } from './types.js';

export interface ProviderInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly requiresBaseUrl?: boolean;
  readonly defaultBaseUrl?: string;
  readonly keyHelpUrl?: string;
}

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: 'google',
    name: 'Google AI Studio',
    description: 'Google AI Studio models discovered from the configured API key.',
    keyHelpUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI models discovered from the configured API key.',
    keyHelpUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Anthropic models discovered from the configured API key.',
    keyHelpUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'OpenRouter models discovered from the public model catalog.',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    keyHelpUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Models discovered from the local Ollama installation.',
    defaultBaseUrl: 'http://localhost:11434',
  },
  {
    id: 'custom',
    name: 'Custom OpenAI-compatible provider',
    description: 'Models discovered from a user-configured OpenAI-compatible endpoint.',
    requiresBaseUrl: true,
  },
];

/**
 * Compatibility shim for callers that have not migrated to runtime discovery.
 * It deliberately returns no model identifiers rather than maintaining a
 * stale static catalog.
 */
export function getAvailableModels(_provider: string): readonly ModelInfo[] {
  return [];
}

export function getDefaultModelForProvider(_provider: string): undefined {
  return undefined;
}
