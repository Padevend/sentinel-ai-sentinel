/**
 * @sentinel/llm — LLM Provider Abstraction
 *
 * Provides a model-agnostic interface for interacting with LLMs.
 * Sentinel supports Google AI Studio (default), Anthropic, OpenAI, and custom endpoints.
 */

export type {
  LLMProvider,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  ProviderConfig,
} from './types.js';

export { GoogleProvider } from './providers/google.js';
export { OpenAIProvider } from './providers/openai.js';
export { AnthropicProvider } from './providers/anthropic.js';
export { ProviderRegistry, createProvider } from './provider-registry.js';

export {
  PROVIDERS,
  MODELS,
  getAvailableModels,
  getDefaultModelForProvider,
} from './models.js';
export type { ModelInfo, ProviderInfo } from './models.js';
