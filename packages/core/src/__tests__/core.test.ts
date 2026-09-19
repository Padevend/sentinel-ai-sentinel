import { describe, it, expect } from 'vitest';
import {
  SentinelEventBus,
  createLogger,
  MetricsCollector,
  loadConfig,
  SentinelError,
  ModelError,
} from '../index.js';

describe('@sentinel/core', () => {
  it('should emit and receive typed events on EventBus', () => {
    const bus = new SentinelEventBus();
    const events: string[] = [];

    const unsub = bus.on('model_response_chunk', (e) => {
      events.push(e.content);
    });

    bus.emit({
      type: 'model_response_chunk',
      content: 'Hello ',
      timestamp: new Date(),
    });

    bus.emit({
      type: 'model_response_chunk',
      content: 'world!',
      timestamp: new Date(),
    });

    expect(events).toEqual(['Hello ', 'world!']);
    unsub();

    bus.emit({
      type: 'model_response_chunk',
      content: 'more',
      timestamp: new Date(),
    });

    expect(events).toHaveLength(2);
  });

  it('should track metrics accurately', () => {
    const metrics = new MetricsCollector();
    metrics.recordModelCall(120, { promptTokens: 50, completionTokens: 20, totalTokens: 70 }, 'test-model');
    metrics.recordToolCall('read_file', 15, true);
    metrics.recordToolCall('read_file', 12, true);
    metrics.recordToolCall('write_file', 30, false);

    const session = metrics.getSessionMetrics();
    expect(session.totalModelCalls).toBe(1);
    expect(session.totalTokens.totalTokens).toBe(70);
    expect(session.totalToolCalls).toBe(3);
    expect(session.toolCallsByName['read_file']).toBe(2);
    expect(session.totalErrors).toBe(1);
  });

  it('should classify typed errors with metadata', () => {
    const err = new ModelError('Rate limit exceeded', {
      code: 'RATE_LIMIT',
      retryable: true,
      recoverable: true,
    });

    expect(err.category).toBe('model');
    expect(err.code).toBe('RATE_LIMIT');
    expect(err.retryable).toBe(true);
    expect(err instanceof SentinelError).toBe(true);
  });

  it('should load configuration and secrets', async () => {
    const resolved = await loadConfig(process.cwd());
    expect(resolved.config.model.provider).toBeDefined();
    expect(resolved.secrets).toBeDefined();
    expect(resolved.projectRoot).toBe(process.cwd());
  });
});
