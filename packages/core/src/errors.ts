/**
 * @sentinel/core — Typed error hierarchy
 *
 * Every error category carries structured information to determine if it's
 * recoverable, retryable, caused by the user, the environment, or critical.
 * This replaces generic `throw new Error("Something went wrong")`.
 */

export type ErrorCategory =
  | 'model'
  | 'tool'
  | 'permission'
  | 'parse'
  | 'storage'
  | 'git'
  | 'process'
  | 'configuration'
  | 'validation'
  | 'context'
  | 'agent';

export interface SentinelErrorOptions {
  readonly category: ErrorCategory;
  readonly code: string;
  readonly recoverable: boolean;
  readonly retryable: boolean;
  readonly cause?: unknown;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Base error class for all Sentinel errors.
 * Carries structured metadata for diagnostic and retry decisions.
 */
export class SentinelError extends Error {
  readonly category: ErrorCategory;
  readonly code: string;
  readonly recoverable: boolean;
  readonly retryable: boolean;
  readonly metadata: Record<string, unknown>;

  constructor(message: string, options: SentinelErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'SentinelError';
    this.category = options.category;
    this.code = options.code;
    this.recoverable = options.recoverable;
    this.retryable = options.retryable;
    this.metadata = options.metadata ?? {};
  }
}

// ─── Specific error classes ──────────────────────────────────────

export class ModelError extends SentinelError {
  constructor(message: string, options?: Partial<Omit<SentinelErrorOptions, 'category'>>) {
    super(message, {
      category: 'model',
      code: options?.code ?? 'MODEL_ERROR',
      recoverable: options?.recoverable ?? false,
      retryable: options?.retryable ?? false,
      cause: options?.cause,
      metadata: options?.metadata,
    });
    this.name = 'ModelError';
  }
}

export class ToolExecutionError extends SentinelError {
  constructor(message: string, options?: Partial<Omit<SentinelErrorOptions, 'category'>>) {
    super(message, {
      category: 'tool',
      code: options?.code ?? 'TOOL_EXECUTION_ERROR',
      recoverable: options?.recoverable ?? true,
      retryable: options?.retryable ?? false,
      cause: options?.cause,
      metadata: options?.metadata,
    });
    this.name = 'ToolExecutionError';
  }
}

export class PermissionError extends SentinelError {
  constructor(message: string, options?: Partial<Omit<SentinelErrorOptions, 'category'>>) {
    super(message, {
      category: 'permission',
      code: options?.code ?? 'PERMISSION_DENIED',
      recoverable: options?.recoverable ?? true,
      retryable: options?.retryable ?? false,
      cause: options?.cause,
      metadata: options?.metadata,
    });
    this.name = 'PermissionError';
  }
}

export class ParseError extends SentinelError {
  constructor(message: string, options?: Partial<Omit<SentinelErrorOptions, 'category'>>) {
    super(message, {
      category: 'parse',
      code: options?.code ?? 'PARSE_ERROR',
      recoverable: options?.recoverable ?? false,
      retryable: options?.retryable ?? false,
      cause: options?.cause,
      metadata: options?.metadata,
    });
    this.name = 'ParseError';
  }
}

export class StorageError extends SentinelError {
  constructor(message: string, options?: Partial<Omit<SentinelErrorOptions, 'category'>>) {
    super(message, {
      category: 'storage',
      code: options?.code ?? 'STORAGE_ERROR',
      recoverable: options?.recoverable ?? false,
      retryable: options?.retryable ?? false,
      cause: options?.cause,
      metadata: options?.metadata,
    });
    this.name = 'StorageError';
  }
}

export class GitError extends SentinelError {
  constructor(message: string, options?: Partial<Omit<SentinelErrorOptions, 'category'>>) {
    super(message, {
      category: 'git',
      code: options?.code ?? 'GIT_ERROR',
      recoverable: options?.recoverable ?? true,
      retryable: options?.retryable ?? false,
      cause: options?.cause,
      metadata: options?.metadata,
    });
    this.name = 'GitError';
  }
}

export class ProcessError extends SentinelError {
  constructor(message: string, options?: Partial<Omit<SentinelErrorOptions, 'category'>>) {
    super(message, {
      category: 'process',
      code: options?.code ?? 'PROCESS_ERROR',
      recoverable: options?.recoverable ?? true,
      retryable: options?.retryable ?? false,
      cause: options?.cause,
      metadata: options?.metadata,
    });
    this.name = 'ProcessError';
  }
}

export class ConfigurationError extends SentinelError {
  constructor(message: string, options?: Partial<Omit<SentinelErrorOptions, 'category'>>) {
    super(message, {
      category: 'configuration',
      code: options?.code ?? 'CONFIGURATION_ERROR',
      recoverable: options?.recoverable ?? false,
      retryable: options?.retryable ?? false,
      cause: options?.cause,
      metadata: options?.metadata,
    });
    this.name = 'ConfigurationError';
  }
}

export class ValidationError extends SentinelError {
  constructor(message: string, options?: Partial<Omit<SentinelErrorOptions, 'category'>>) {
    super(message, {
      category: 'validation',
      code: options?.code ?? 'VALIDATION_ERROR',
      recoverable: options?.recoverable ?? true,
      retryable: options?.retryable ?? false,
      cause: options?.cause,
      metadata: options?.metadata,
    });
    this.name = 'ValidationError';
  }
}

export class AgentError extends SentinelError {
  constructor(message: string, options?: Partial<Omit<SentinelErrorOptions, 'category'>>) {
    super(message, {
      category: 'agent',
      code: options?.code ?? 'AGENT_ERROR',
      recoverable: options?.recoverable ?? false,
      retryable: options?.retryable ?? false,
      cause: options?.cause,
      metadata: options?.metadata,
    });
    this.name = 'AgentError';
  }
}

// ─── Type guard ──────────────────────────────────────────────────

export function isSentinelError(error: unknown): error is SentinelError {
  return error instanceof SentinelError;
}
