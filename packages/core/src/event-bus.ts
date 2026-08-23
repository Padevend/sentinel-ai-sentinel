/**
 * @sentinel/core — Event bus implementation
 *
 * Simple typed event bus for decoupled communication between
 * Sentinel components (tools, agent, UI, model adapter).
 */

import type { SentinelEvent, EventBus } from './types.js';

type EventHandler<T extends SentinelEvent> = (event: T) => void;

/**
 * In-process event bus with typed event dispatch.
 * Components subscribe to specific event types and receive
 * only matching events with full type inference.
 */
export class SentinelEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<EventHandler<SentinelEvent>>>();

  emit(event: SentinelEvent): void {
    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          handler(event);
        } catch {
          // Event handlers must not crash the emitter
        }
      }
    }
  }

  on<T extends SentinelEvent['type']>(
    type: T,
    handler: (event: Extract<SentinelEvent, { type: T }>) => void,
  ): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    const typeHandlers = this.handlers.get(type)!;
    const wrappedHandler = handler as EventHandler<SentinelEvent>;
    typeHandlers.add(wrappedHandler);

    // Return unsubscribe function
    return () => {
      typeHandlers.delete(wrappedHandler);
    };
  }

  /**
   * Remove all handlers. Useful for cleanup during tests or shutdown.
   */
  clear(): void {
    this.handlers.clear();
  }
}
