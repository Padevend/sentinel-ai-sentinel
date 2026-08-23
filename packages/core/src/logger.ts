/**
 * @sentinel/core — Structured logger
 *
 * JSON-structured logging with levels, timestamps, component tags,
 * and duration tracking. Automatically filters secrets and sensitive content.
 */

import type { LogLevel } from './types.js';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly component: string;
  readonly message: string;
  readonly duration?: number;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Creates a scoped logger for a specific component.
 * All log entries are structured JSON for observability.
 */
export class Logger {
  private readonly component: string;
  private level: LogLevel;

  constructor(component: string, level: LogLevel = 'info') {
    this.component = component;
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.log('error', message, metadata);
  }

  /**
   * Measure the duration of an async operation.
   */
  async timed<T>(
    label: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>,
  ): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = Math.round(performance.now() - start);
      this.info(label, { ...metadata, duration });
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - start);
      this.error(`${label} failed`, { ...metadata, duration, error: String(error) });
      throw error;
    }
  }

  /**
   * Create a child logger with a sub-component name.
   */
  child(subComponent: string): Logger {
    return new Logger(`${this.component}:${subComponent}`, this.level);
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
      ...(metadata ? { metadata: sanitizeMetadata(metadata) } : {}),
    };

    const output = JSON.stringify(entry);

    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'debug':
        console.debug(output);
        break;
      default:
        console.log(output);
    }
  }
}

// ─── Secret filtering ────────────────────────────────────────────

const SENSITIVE_KEYS = new Set([
  'apikey', 'api_key', 'apiKey',
  'secret', 'password', 'token',
  'authorization', 'credential',
  'private_key', 'privateKey',
]);

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// ─── Factory ─────────────────────────────────────────────────────

/**
 * Create a logger for a Sentinel component.
 */
export function createLogger(component: string, level?: LogLevel): Logger {
  return new Logger(component, level);
}
