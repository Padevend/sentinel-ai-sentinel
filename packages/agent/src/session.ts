/**
 * @sentinel/agent — Agent Session Domain Model
 *
 * Manages conversation history, session status, state snapshots,
 * modified files tracking, and step checkpoints for crash resilience and recovery.
 */

import type {
  SessionId,
  ProjectId,
  WorkspaceId,
  Message,
  TokenUsage,
  SessionStatus,
  AgentStateSnapshot,
  SessionCheckpoint,
  StoredSession,
} from '@sentinel/core';
import type { MemoryEngine } from '@sentinel/memory';

export interface SessionOptions {
  sessionId?: string;
  projectId?: string;
  workspaceId?: string;
  modelId?: string;
  providerName?: string;
  memory?: MemoryEngine;
}

export class AgentSession {
  public readonly id: SessionId;
  public readonly projectId: ProjectId;
  public readonly workspaceId: WorkspaceId;
  public createdAt: number;
  public updatedAt: number;
  public status: SessionStatus = 'active';
  public taskSummary?: string;
  public modelId: string;
  public providerName: string;

  private readonly messages: Message[] = [];
  private readonly checkpoints: SessionCheckpoint[] = [];
  private readonly filesModified = new Set<string>();
  private totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  private state: AgentStateSnapshot = {
    completedSteps: [],
    pendingSteps: [],
    verificationStatus: 'untested',
  };

  constructor(options?: SessionOptions, public readonly memory?: MemoryEngine) {
    const now = Date.now();
    this.id = (options?.sessionId || `sess_${now}_${Math.random().toString(36).slice(2, 7)}`) as SessionId;
    this.projectId = (options?.projectId || 'proj_default') as ProjectId;
    this.workspaceId = (options?.workspaceId || 'ws_default') as WorkspaceId;
    this.modelId = options?.modelId ?? '';
    this.providerName = options?.providerName ?? '';
    this.createdAt = now;
    this.updatedAt = now;
  }

  addMessage(message: Message): void {
    this.messages.push(message);
    this.updatedAt = Date.now();
  }

  getMessages(): readonly Message[] {
    return this.messages;
  }

  clear(): void {
    this.messages.length = 0;
    this.updatedAt = Date.now();
  }

  recordUsage(usage: TokenUsage): void {
    this.totalUsage = {
      promptTokens: this.totalUsage.promptTokens + usage.promptTokens,
      completionTokens: this.totalUsage.completionTokens + usage.completionTokens,
      totalTokens: this.totalUsage.totalTokens + usage.totalTokens,
    };
    this.updatedAt = Date.now();
  }

  getUsage(): TokenUsage {
    return this.totalUsage;
  }

  setStatus(status: SessionStatus): void {
    this.status = status;
    this.updatedAt = Date.now();
  }

  setTaskSummary(summary: string): void {
    this.taskSummary = summary;
    this.updatedAt = Date.now();
  }

  recordModifiedFile(filePath: string): void {
    this.filesModified.add(filePath);
    this.updatedAt = Date.now();
  }

  getModifiedFiles(): readonly string[] {
    return [...this.filesModified];
  }

  getState(): AgentStateSnapshot {
    return this.state;
  }

  updateState(partial: Partial<AgentStateSnapshot>): void {
    this.state = {
      ...this.state,
      ...partial,
      completedSteps: partial.completedSteps ?? this.state.completedSteps,
      pendingSteps: partial.pendingSteps ?? this.state.pendingSteps,
    };
    this.updatedAt = Date.now();
  }

  createCheckpoint(summary: string, filesModified?: string[]): SessionCheckpoint {
    if (filesModified) {
      for (const f of filesModified) this.filesModified.add(f);
    }

    const checkpoint: SessionCheckpoint = {
      id: `chk_${Date.now()}_${this.checkpoints.length + 1}`,
      sessionId: this.id,
      stepIndex: this.checkpoints.length + 1,
      summary,
      state: { ...this.state },
      filesModified: [...this.filesModified],
      timestamp: Date.now(),
    };

    this.checkpoints.push(checkpoint);
    this.updatedAt = Date.now();
    return checkpoint;
  }

  getCheckpoints(): readonly SessionCheckpoint[] {
    return this.checkpoints;
  }

  getLatestCheckpoint(): SessionCheckpoint | undefined {
    return this.checkpoints[this.checkpoints.length - 1];
  }

  toStoredSession(): StoredSession {
    return {
      id: this.id,
      projectId: this.projectId,
      workspaceId: this.workspaceId,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      taskSummary: this.taskSummary,
      modelId: this.modelId,
      providerName: this.providerName,
      messages: this.messages,
      state: this.state,
      checkpoints: this.checkpoints,
      filesModified: [...this.filesModified],
      totalUsage: this.totalUsage,
    };
  }

  private restore(stored: StoredSession): void {
    this.createdAt = stored.createdAt;
    this.updatedAt = stored.updatedAt;
    this.status = stored.status;
    this.taskSummary = stored.taskSummary;
    this.state = { ...stored.state, completedSteps: [...stored.state.completedSteps], pendingSteps: [...stored.state.pendingSteps] };
    this.totalUsage = { ...stored.totalUsage };
    this.messages.push(...stored.messages.map((message) => ({ ...message, timestamp: message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp) })));
    this.checkpoints.push(...stored.checkpoints.map((checkpoint) => ({ ...checkpoint, state: { ...checkpoint.state, completedSteps: [...checkpoint.state.completedSteps], pendingSteps: [...checkpoint.state.pendingSteps] }, filesModified: [...checkpoint.filesModified] })));
    for (const filePath of stored.filesModified) this.filesModified.add(filePath);
  }

  static fromStoredSession(stored: StoredSession, memory?: MemoryEngine): AgentSession {
    const session = new AgentSession({ sessionId: stored.id, projectId: stored.projectId, workspaceId: stored.workspaceId, modelId: stored.modelId, providerName: stored.providerName }, memory);
    session.restore(stored);
    return session;
  }
}
