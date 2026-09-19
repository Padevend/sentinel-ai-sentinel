/**
 * @sentinel/llm — LLM Provider Abstraction
 *
 * Provides a model-agnostic interface for interacting with LLMs.
 * Sentinel supports Google AI Studio (default), Anthropic, OpenAI, and custom endpoints.
 */

export type {
  LLMProvider,
  ModelProvider,
  CompletionParams,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  StreamEvent,
  ProviderConfig,
} from './types.js';

export { GoogleProvider } from './providers/google.js';
export { OpenAIProvider } from './providers/openai.js';
export { AnthropicProvider } from './providers/anthropic.js';
export { ProviderRegistry, createProvider } from './provider-registry.js';
export { ModelDiscovery } from './model-discovery.js';

export {
  PROVIDERS,
  getAvailableModels,
  getDefaultModelForProvider,
} from './models.js';
export type { ProviderInfo } from './models.js';
export type { ModelInfo, ReasoningEffort } from './types.js';
