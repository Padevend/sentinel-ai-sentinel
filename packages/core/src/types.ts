/**
 * @sentinel/core — Shared types and interfaces
 *
 * Foundational type definitions used across all Sentinel packages.
 * These types enforce strong contracts between modules and prevent
 * loose `any` or `Record<string, unknown>` at module boundaries.
 */

// ─── Branded Types ───────────────────────────────────────────────

/** Unique identifier for a tool call within an agent loop iteration. */
export type ToolCallId = string & { readonly __brand: 'ToolCallId' };

/** Unique identifier for an agent session. */
export type SessionId = string & { readonly __brand: 'SessionId' };

/** Unique identifier for a project. */
export type ProjectId = string & { readonly __brand: 'ProjectId' };

/** Unique identifier for a workspace. */
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' };

/** Absolute filesystem path, validated at boundaries. */
export type AbsolutePath = string & { readonly __brand: 'AbsolutePath' };

// ─── Runtime & Platform Paths ────────────────────────────────────

export interface SentinelPaths {
  readonly rootDir: string;
  readonly configDir: string;
  readonly dataDir: string;
  readonly cacheDir: string;
  readonly logsDir: string;
}

export type PlatformType = 'windows' | 'linux' | 'darwin' | 'unknown';

// ─── Agent State ─────────────────────────────────────────────────

/**
 * Explicit agent state machine. The agent is always in exactly one of
 * these states — no ad-hoc booleans.
 */
export type AgentState =
  | 'idle'
  | 'planning'
  | 'executing'
  | 'waiting_for_confirmation'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled';

// ─── Messages ────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface Message {
  readonly role: MessageRole;
  readonly content: string;
  readonly toolCalls?: readonly ToolCall[];
  readonly toolCallId?: ToolCallId;
  readonly timestamp: Date;
}

// ─── Tool Calling ────────────────────────────────────────────────

export interface ToolCall {
  readonly id: ToolCallId;
  readonly toolName: string;
  readonly input: unknown;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

// ─── Tool Results ────────────────────────────────────────────────

export interface ToolResult {
  readonly success: boolean;
  readonly output: string;
  readonly data?: unknown;
  readonly metadata?: ToolMetadata;
  readonly error?: ToolError;
}

export interface ToolMetadata {
  readonly durationMs: number;
  readonly toolName: string;
  readonly [key: string]: unknown;
}

export interface ToolError {
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
  readonly retryable: boolean;
}

// ─── Token Usage ─────────────────────────────────────────────────

export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

// ─── Finish Reason ───────────────────────────────────────────────

export type FinishReason = 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'error';

// ─── Permission Levels ───────────────────────────────────────────

/**
 * Three-tier permission system:
 * - safe: read-only operations, no side effects
 * - confirm_recommended: write operations, configurable confirmation
 * - confirm_required: destructive operations, always requires confirmation
 */
export type PermissionLevel = 'safe' | 'confirm_recommended' | 'confirm_required';

// ─── Project & Workspace Types ───────────────────────────────────

export interface ProjectRoot {
  readonly path: string;
  readonly detectionMethod: 'git' | 'workspace' | 'manifest' | 'cwd';
  readonly confidence: number;
}

export interface ProjectIdentity {
  readonly id: ProjectId;
  readonly name: string;
  readonly canonicalPath: string;
  readonly gitRemote?: string;
  readonly createdAt: number;
  readonly lastSeenAt: number;
}

export interface WorkspaceIdentity {
  readonly id: WorkspaceId;
  readonly projectRoot: string;
  readonly projectId: ProjectId;
  readonly createdAt: number;
  readonly lastActiveAt: number;
}

export interface ProjectInfo {
  readonly name: string;
  readonly rootPath: AbsolutePath;
  readonly languages: readonly string[];
  readonly frameworks: readonly string[];
  readonly packageManager: string | null;
  readonly testFramework: string | null;
  readonly hasGit: boolean;
  readonly scripts: Record<string, string>;
  readonly fileCount: number;
}

// ─── Session Domain & Checkpoints ────────────────────────────────

export type SessionStatus =
  | 'active'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'cancelled';

export interface AgentStateSnapshot {
  readonly plan?: string;
  readonly currentStep?: string;
  readonly completedSteps: readonly string[];
  readonly pendingSteps: readonly string[];
  readonly activeTool?: string;
  readonly relevantContext?: readonly string[];
  readonly verificationStatus?: 'untested' | 'passing' | 'failing';
}

export interface SessionCheckpoint {
  readonly id: string;
  readonly sessionId: SessionId;
  readonly stepIndex: number;
  readonly summary: string;
  readonly state: AgentStateSnapshot;
  readonly filesModified: readonly string[];
  readonly timestamp: number;
}

export interface SessionSummary {
  readonly id: SessionId;
  readonly projectId: ProjectId;
  readonly workspaceId: WorkspaceId;
  readonly status: SessionStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly taskSummary?: string;
  readonly modelId?: string;
  readonly providerName?: string;
  readonly totalTokens?: TokenUsage;
  readonly filesModified: readonly string[];
}

export interface StoredSession {
  readonly id: SessionId;
  readonly projectId: ProjectId;
  readonly workspaceId: WorkspaceId;
  readonly status: SessionStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly taskSummary?: string;
  readonly modelId: string;
  readonly providerName: string;
  readonly messages: readonly Message[];
  readonly state: AgentStateSnapshot;
  readonly checkpoints: readonly SessionCheckpoint[];
  readonly filesModified: readonly string[];
  readonly totalUsage: TokenUsage;
}

// ─── Repositories (Persistence Port Interfaces) ──────────────────

export interface ProjectRepository {
  save(project: ProjectIdentity): Promise<void>;
  findById(id: ProjectId): Promise<ProjectIdentity | null>;
  findByPath(path: string): Promise<ProjectIdentity | null>;
  list(): Promise<ProjectIdentity[]>;
}

export interface WorkspaceRepository {
  save(workspace: WorkspaceIdentity): Promise<void>;
  findById(id: WorkspaceId): Promise<WorkspaceIdentity | null>;
  findByProjectRoot(root: string): Promise<WorkspaceIdentity | null>;
}

export interface SessionRepository {
  save(session: StoredSession): Promise<void>;
  findById(id: SessionId): Promise<StoredSession | null>;
  findLatestForProject(projectId: ProjectId, statuses?: SessionStatus[]): Promise<StoredSession | null>;
  listForProject(projectId: ProjectId, limit?: number): Promise<SessionSummary[]>;
  delete(id: SessionId): Promise<boolean>;
  saveCheckpoint(checkpoint: SessionCheckpoint): Promise<void>;
  getCheckpoints(sessionId: SessionId): Promise<SessionCheckpoint[]>;
}

// ─── Context Types ───────────────────────────────────────────────

export interface ContextItem {
  readonly source: string;
  readonly content: string;
  readonly relevance: number;
  readonly type: ContextItemType;
  readonly tokenEstimate: number;
}

export type ContextItemType =
  | 'file'
  | 'symbol'
  | 'search_result'
  | 'project_info'
  | 'tool_result'
  | 'memory';

// ─── Knowledge Assertions (future Behavioral Twin prep) ──────────

export interface KnowledgeAssertion {
  readonly statement: string;
  readonly confidence: number;
  readonly sources: readonly SourceReference[];
  readonly status: 'observed' | 'inferred' | 'verified';
}

export interface SourceReference {
  readonly type: 'file' | 'ast' | 'git' | 'runtime' | 'test' | 'user';
  readonly location: string;
  readonly timestamp: Date;
}

// ─── Log Levels ──────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// ─── Events ──────────────────────────────────────────────────────

export type SentinelEvent =
  | ToolStartedEvent
  | ToolCompletedEvent
  | ModelRequestStartedEvent
  | ModelResponseChunkEvent
  | ModelRequestCompletedEvent
  | AgentStateChangedEvent
  | FileChangedEvent;

export interface ToolStartedEvent {
  readonly type: 'tool_started';
  readonly toolName: string;
  readonly toolCallId: ToolCallId;
  readonly input: unknown;
  readonly timestamp: Date;
}

export interface ToolCompletedEvent {
  readonly type: 'tool_completed';
  readonly toolName: string;
  readonly toolCallId: ToolCallId;
  readonly result: ToolResult;
  readonly durationMs: number;
  readonly timestamp: Date;
}

export interface ModelRequestStartedEvent {
  readonly type: 'model_request_started';
  readonly modelId: string;
  readonly timestamp: Date;
}

export interface ModelResponseChunkEvent {
  readonly type: 'model_response_chunk';
  readonly content: string;
  readonly timestamp: Date;
}

export interface ModelRequestCompletedEvent {
  readonly type: 'model_request_completed';
  readonly modelId: string;
  readonly usage: TokenUsage;
  readonly durationMs: number;
  readonly timestamp: Date;
}

export interface AgentStateChangedEvent {
  readonly type: 'agent_state_changed';
  readonly previousState: AgentState;
  readonly newState: AgentState;
  readonly timestamp: Date;
}

export interface FileChangedEvent {
  readonly type: 'file_changed';
  readonly filePath: string;
  readonly changeType: 'created' | 'modified' | 'deleted';
  readonly timestamp: Date;
}

// ─── Event Emitter Interface ─────────────────────────────────────

export interface EventBus {
  emit(event: SentinelEvent): void;
  on<T extends SentinelEvent['type']>(
    type: T,
    handler: (event: Extract<SentinelEvent, { type: T }>) => void,
  ): () => void;
}
