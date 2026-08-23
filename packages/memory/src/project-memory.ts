/**
 * @sentinel/memory — Project Memory
 *
 * Persistent memory regarding the project:
 * architecture notes, conventions, test command preferences, etc.
 * Backed by StorageAdapter.
 */

import type { StorageAdapter } from '@sentinel/storage';

export class ProjectMemory {
  constructor(private readonly storage?: StorageAdapter) {}

  async remember(key: string, value: unknown): Promise<void> {
    if (this.storage) {
      await this.storage.set('memory', key, value);
    }
  }

  async recall<T>(key: string): Promise<T | null> {
    if (!this.storage) return null;
    return this.storage.get<T>('memory', key);
  }

  async listAll(): Promise<Array<{ key: string; value: unknown }>> {
    if (!this.storage) return [];
    return this.storage.list('memory');
  }
}
