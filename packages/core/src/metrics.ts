/**
 * @sentinel/core — Metrics collection
 *
 * Tracks operational metrics for observability:
 * LLM call durations, token usage, tool invocations,
 * iteration counts, errors, and task durations.
 */

import type { TokenUsage } from './types.js';

export interface MetricEntry {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly tags: Record<string, string>;
  readonly timestamp: Date;
}

export interface SessionMetrics {
  readonly totalModelCalls: number;
  readonly totalTokens: TokenUsage;
  readonly totalToolCalls: number;
  readonly toolCallsByName: Record<string, number>;
  readonly totalErrors: number;
  readonly totalIterations: number;
  readonly sessionDurationMs: number;
}

/**
 * Collects and aggregates metrics for a Sentinel session.
 * Designed for local observability — not a telemetry system.
 */
export class MetricsCollector {
  private readonly entries: MetricEntry[] = [];
  private readonly sessionStart: Date;

  private modelCalls = 0;
  private promptTokens = 0;
  private completionTokens = 0;
  private toolCalls = 0;
  private readonly toolCallCounts: Map<string, number> = new Map();
  private errors = 0;
  private iterations = 0;

  constructor() {
    this.sessionStart = new Date();
  }

  recordModelCall(durationMs: number, usage: TokenUsage, modelId: string): void {
    this.modelCalls++;
    this.promptTokens += usage.promptTokens;
    this.completionTokens += usage.completionTokens;

    this.entries.push({
      name: 'model_call',
      value: durationMs,
      unit: 'ms',
      tags: { modelId },
      timestamp: new Date(),
    });
  }

  recordToolCall(toolName: string, durationMs: number, success: boolean): void {
    this.toolCalls++;
    this.toolCallCounts.set(toolName, (this.toolCallCounts.get(toolName) ?? 0) + 1);

    if (!success) {
      this.errors++;
    }

    this.entries.push({
      name: 'tool_call',
      value: durationMs,
      unit: 'ms',
      tags: { toolName, success: String(success) },
      timestamp: new Date(),
    });
  }

  recordIteration(): void {
    this.iterations++;
  }

  recordError(component: string, errorCode: string): void {
    this.errors++;
    this.entries.push({
      name: 'error',
      value: 1,
      unit: 'count',
      tags: { component, errorCode },
      timestamp: new Date(),
    });
  }

  getSessionMetrics(): SessionMetrics {
    return {
      totalModelCalls: this.modelCalls,
      totalTokens: {
        promptTokens: this.promptTokens,
        completionTokens: this.completionTokens,
        totalTokens: this.promptTokens + this.completionTokens,
      },
      totalToolCalls: this.toolCalls,
      toolCallsByName: Object.fromEntries(this.toolCallCounts),
      totalErrors: this.errors,
      totalIterations: this.iterations,
      sessionDurationMs: Date.now() - this.sessionStart.getTime(),
    };
  }

  getEntries(): readonly MetricEntry[] {
    return this.entries;
  }
}
