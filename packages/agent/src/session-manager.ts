/**
 * @sentinel/agent — Session Manager
 *
 * Coordinates session lifecycle, atomic persistence, checkpoints,
 * crash recovery, consistency checks, and context reconstruction.
 */

import { stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import type {
  SessionId,
  ProjectId,
  WorkspaceId,
  SessionSummary,
  SessionStatus,
  SessionRepository,
} from '@sentinel/core';
import type { MemoryEngine } from '@sentinel/memory';
import { AgentSession, type SessionOptions } from './session.js';

const execFileAsync = promisify(execFile);

export interface ConsistencyCheckResult {
  readonly isConsistent: boolean;
  readonly changedFiles: readonly string[];
  readonly warning?: string;
}

export interface ResumeValidationOptions {
  readonly expectedProjectId?: ProjectId;
  readonly providerAvailable?: () => Promise<boolean>;
}

export class SessionManager {
  constructor(private readonly sessionRepo: SessionRepository) {}

  /**
   * Creates and initializes a new persistent session.
   */
  async createSession(options: SessionOptions, memory?: MemoryEngine): Promise<AgentSession> {
    const session = new AgentSession(options, memory);
    await this.saveSession(session);
    return session;
  }

  /**
   * Persists the session and its checkpoints.
   */
  async saveSession(session: AgentSession): Promise<void> {
    const stored = session.toStoredSession();
    await this.sessionRepo.save(stored);
  }

  /**
   * Loads an existing session by ID.
   */
  async loadSession(sessionId: SessionId, memory?: MemoryEngine): Promise<AgentSession | null> {
    const stored = await this.sessionRepo.findById(sessionId);
    if (!stored) return null;
    return AgentSession.fromStoredSession(stored, memory);
  }

  /**
   * Finds the latest interrupted, active, or paused session for a project.
   */
  async getLatestResumableSession(
    projectId: ProjectId,
    memory?: MemoryEngine,
  ): Promise<AgentSession | null> {
    const statuses: SessionStatus[] = ['interrupted', 'paused', 'active'];
    const stored = await this.sessionRepo.findLatestForProject(projectId, statuses);
    if (!stored) return null;
    return AgentSession.fromStoredSession(stored, memory);
  }

  /**
   * Lists recent sessions for a project.
   */
  async listSessionsForProject(projectId: ProjectId, limit = 20): Promise<SessionSummary[]> {
    return this.sessionRepo.listForProject(projectId, limit);
  }

  /**
   * Deletes a session by ID.
   */
  async deleteSession(sessionId: SessionId): Promise<boolean> {
    return this.sessionRepo.delete(sessionId);
  }

  /**
   * Validates consistency before resuming a session:
   * checks if previously modified files were changed externally since the last checkpoint.
   */
  async checkConsistency(
    session: AgentSession,
    projectRoot: string,
    options: ResumeValidationOptions = {},
  ): Promise<ConsistencyCheckResult> {
    const modifiedFiles = session.getModifiedFiles();
    const externallyChanged: string[] = [];
    const warnings: string[] = [];

    if (options.expectedProjectId && options.expectedProjectId !== session.projectId) {
      warnings.push('The saved session belongs to a different project identity.');
    }

    try {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain=v1', '-b'], { cwd: projectRoot, timeout: 10_000 });
      const changedLines = stdout.split(/\r?\n/).filter((line) => line.length > 0 && !line.startsWith('##'));
      if (changedLines.length > 0) warnings.push(`Git has ${changedLines.length} uncommitted change(s) before resume.`);
    } catch {
      // Non-Git projects are valid; project identity fallback is filesystem-based.
    }

    if (options.providerAvailable) {
      try {
        if (!(await options.providerAvailable())) warnings.push('The configured model provider is not currently available.');
      } catch {
        warnings.push('The configured model provider could not be checked.');
      }
    }

    const latestCheckpoint = session.getLatestCheckpoint();
    const referenceTime = latestCheckpoint?.timestamp ?? session.updatedAt;

    for (const relPath of modifiedFiles) {
      const fullPath = join(projectRoot, relPath);
      try {
        const fileStat = await stat(fullPath);
        // If file was modified more than 500ms after the checkpoint
        if (fileStat.mtimeMs > referenceTime + 500) {
          externallyChanged.push(relPath);
        }
      } catch {
        // File may have been deleted externally
        externallyChanged.push(`${relPath} (deleted or missing)`);
      }
    }

    if (externallyChanged.length > 0) {
      return {
        isConsistent: false,
        changedFiles: externallyChanged,
        warning: [...warnings, `The project changed externally since the last checkpoint in ${externallyChanged.length} file(s).`].join(' '),
      };
    }

    return {
      isConsistent: warnings.length === 0,
      changedFiles: [],
      warning: warnings.length > 0 ? warnings.join(' ') : undefined,
    };
  }

  /**
   * Reconstructs an efficient summary context from session state & checkpoints.
   */
  reconstructContext(session: AgentSession): string {
    const state = session.getState();
    const latestCheckpoint = session.getLatestCheckpoint();

    const sections: string[] = [
      `## Resumed Session: ${session.id}`,
      `Task: ${session.taskSummary || 'Unspecified task'}`,
    ];

    if (state.plan) {
      sections.push(`### Current Plan\n${state.plan}`);
    }

    if (state.completedSteps.length > 0) {
      sections.push(
        `### Completed Steps\n${state.completedSteps.map((s) => `✓ ${s}`).join('\n')}`,
      );
    }

    if (state.pendingSteps.length > 0) {
      sections.push(
        `### Pending Steps\n${state.pendingSteps.map((s) => `⏳ ${s}`).join('\n')}`,
      );
    }

    const modified = session.getModifiedFiles();
    if (modified.length > 0) {
      sections.push(`### Modified Files\n${modified.map((f) => `- ${f}`).join('\n')}`);
    }

    if (latestCheckpoint) {
      sections.push(`### Last Checkpoint (${latestCheckpoint.stepIndex})\n${latestCheckpoint.summary}`);
    }

    return sections.join('\n\n');
  }
}
