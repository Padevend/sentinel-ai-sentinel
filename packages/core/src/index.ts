/**
 * @sentinel/core — Public API
 *
 * Re-exports all public types, classes, and functions from the core package.
 * Other packages import from '@sentinel/core' — never from internal paths.
 */

// Types
export type {
  ToolCallId,
  SessionId,
  AbsolutePath,
  AgentState,
  MessageRole,
  Message,
  ToolCall,
  ToolDefinition,
  ToolResult,
  ToolMetadata,
  ToolError,
  TokenUsage,
  FinishReason,
  PermissionLevel,
  ProjectInfo,
  ContextItem,
  ContextItemType,
  KnowledgeAssertion,
  SourceReference,
  LogLevel,
  SentinelEvent,
  ToolStartedEvent,
  ToolCompletedEvent,
  ModelRequestStartedEvent,
  ModelResponseChunkEvent,
  ModelRequestCompletedEvent,
  AgentStateChangedEvent,
  FileChangedEvent,
  EventBus,
} from './types.js';

// Errors
export {
  SentinelError,
  ModelError,
  ToolExecutionError,
  PermissionError,
  ParseError,
  StorageError,
  GitError,
  ProcessError,
  ConfigurationError,
  ValidationError,
  AgentError,
  isSentinelError,
} from './errors.js';
export type { ErrorCategory, SentinelErrorOptions } from './errors.js';

// Config
export {
  loadConfig,
  loadSettings,
  saveSettings,
  updateSettings,
  resetSettings,
  isFirstLaunch,
  getGlobalSettingsDir,
  getGlobalSettingsPath,
} from './config.js';
export type {
  SentinelConfig,
  ModelConfig,
  RuntimeSecrets,
  ResolvedConfig,
  SettingsData,
} from './config.js';

// Logger
export { Logger, createLogger } from './logger.js';
export type { LogEntry } from './logger.js';

// Metrics
export { MetricsCollector } from './metrics.js';
export type { MetricEntry, SessionMetrics } from './metrics.js';

// Event Bus
export { SentinelEventBus } from './event-bus.js';
