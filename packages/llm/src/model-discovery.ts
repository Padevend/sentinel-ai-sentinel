import type { LLMProvider, ModelInfo } from './types.js';

export interface ModelDiscoveryOptions {
  readonly ttlMs?: number;
  readonly now?: () => number;
}

interface CacheEntry {
  readonly expiresAt: number;
  readonly models: readonly ModelInfo[];
}

/** Runtime model catalog with a bounded, configurable TTL cache. */
export class ModelDiscovery {
  private readonly cache = new Map<LLMProvider, CacheEntry>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: ModelDiscoveryOptions = {}) {
    this.ttlMs = options.ttlMs ?? 4 * 60 * 60 * 1000;
    this.now = options.now ?? Date.now;
  }

  async listModels(provider: LLMProvider, forceRefresh = false): Promise<readonly ModelInfo[]> {
    const cached = this.cache.get(provider);
    if (!forceRefresh && cached && cached.expiresAt > this.now()) {
      return cached.models;
    }

    const models = await provider.listModels();
    this.cache.set(provider, { models, expiresAt: this.now() + this.ttlMs });
    return models;
  }

  clear(provider?: LLMProvider): void {
    if (!provider) {
      this.cache.clear();
      return;
    }
    this.cache.delete(provider);
  }
}
