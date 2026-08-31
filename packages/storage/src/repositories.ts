/**
 * @sentinel/storage — Persistent Domain Repositories
 *
 * Provides transactional, strongly typed repositories for Projects, Workspaces,
 * and Sessions backed by SQLite with in-memory fallbacks for unit tests.
 */

import Database from 'better-sqlite3';
import type {
  ProjectId,
  WorkspaceId,
  SessionId,
  ProjectIdentity,
  WorkspaceIdentity,
  StoredSession,
  SessionSummary,
  SessionCheckpoint,
  SessionStatus,
} from '@sentinel/core';
import { SchemaMigrationRunner } from './migrations.js';

export class SQLiteRepositories {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    SchemaMigrationRunner.runMigrations(this.db);
  }

  get projects(): ProjectRepository {
    return new SQLiteProjectRepository(this.db);
  }

  get workspaces(): WorkspaceRepository {
    return new SQLiteWorkspaceRepository(this.db);
  }

  get sessions(): SessionRepository {
    return new SQLiteSessionRepository(this.db);
  }

  close(): void {
    this.db.close();
  }
}

// ─── Project Repository ──────────────────────────────────────────

export interface ProjectRepository {
  save(project: ProjectIdentity): Promise<void>;
  findById(id: ProjectId): Promise<ProjectIdentity | null>;
  findByPath(path: string): Promise<ProjectIdentity | null>;
  list(): Promise<ProjectIdentity[]>;
}

class SQLiteProjectRepository implements ProjectRepository {
  constructor(private readonly db: Database.Database) {}

  async save(project: ProjectIdentity): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO projects (id, name, canonical_path, git_remote, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        canonical_path = excluded.canonical_path,
        git_remote = excluded.git_remote,
        last_seen_at = excluded.last_seen_at
    `);
    stmt.run(
      project.id,
      project.name,
      project.canonicalPath,
      project.gitRemote ?? null,
      project.createdAt,
      project.lastSeenAt,
    );
  }

  async findById(id: ProjectId): Promise<ProjectIdentity | null> {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return {
      id: row.id as ProjectId,
      name: row.name,
      canonicalPath: row.canonical_path,
      gitRemote: row.git_remote ?? undefined,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
    };
  }

  async findByPath(path: string): Promise<ProjectIdentity | null> {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE canonical_path = ?');
    const row = stmt.get(path) as any;
    if (!row) return null;
    return {
      id: row.id as ProjectId,
      name: row.name,
      canonicalPath: row.canonical_path,
      gitRemote: row.git_remote ?? undefined,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
    };
  }

  async list(): Promise<ProjectIdentity[]> {
    const stmt = this.db.prepare('SELECT * FROM projects ORDER BY last_seen_at DESC');
    const rows = stmt.all() as any[];
    return rows.map((row) => ({
      id: row.id as ProjectId,
      name: row.name,
      canonicalPath: row.canonical_path,
      gitRemote: row.git_remote ?? undefined,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
    }));
  }
}

// ─── Workspace Repository ────────────────────────────────────────

export interface WorkspaceRepository {
  save(workspace: WorkspaceIdentity): Promise<void>;
  findById(id: WorkspaceId): Promise<WorkspaceIdentity | null>;
  findByProjectRoot(root: string): Promise<WorkspaceIdentity | null>;
}

class SQLiteWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly db: Database.Database) {}

  async save(workspace: WorkspaceIdentity): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO workspaces (id, project_root, project_id, created_at, last_active_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        project_root = excluded.project_root,
        project_id = excluded.project_id,
        last_active_at = excluded.last_active_at
    `);
    stmt.run(
      workspace.id,
      workspace.projectRoot,
      workspace.projectId,
      workspace.createdAt,
      workspace.lastActiveAt,
    );
  }

  async findById(id: WorkspaceId): Promise<WorkspaceIdentity | null> {
    const stmt = this.db.prepare('SELECT * FROM workspaces WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return {
      id: row.id as WorkspaceId,
      projectRoot: row.project_root,
      projectId: row.project_id as ProjectId,
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
    };
  }

  async findByProjectRoot(root: string): Promise<WorkspaceIdentity | null> {
    const stmt = this.db.prepare('SELECT * FROM workspaces WHERE project_root = ?');
    const row = stmt.get(root) as any;
    if (!row) return null;
    return {
      id: row.id as WorkspaceId,
      projectRoot: row.project_root,
      projectId: row.project_id as ProjectId,
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
    };
  }
}

// ─── Session Repository ──────────────────────────────────────────

export interface SessionRepository {
  save(session: StoredSession): Promise<void>;
  findById(id: SessionId): Promise<StoredSession | null>;
  findLatestForProject(projectId: ProjectId, statuses?: SessionStatus[]): Promise<StoredSession | null>;
  listForProject(projectId: ProjectId, limit?: number): Promise<SessionSummary[]>;
  delete(id: SessionId): Promise<boolean>;
  saveCheckpoint(checkpoint: SessionCheckpoint): Promise<void>;
  getCheckpoints(sessionId: SessionId): Promise<SessionCheckpoint[]>;
}

class SQLiteSessionRepository implements SessionRepository {
  constructor(private readonly db: Database.Database) {}

  async save(session: StoredSession): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (
        id, project_id, workspace_id, status, created_at, updated_at,
        task_summary, model_id, provider_name, messages, state,
        checkpoints, files_modified, total_usage
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        workspace_id = excluded.workspace_id,
        status = excluded.status,
        updated_at = excluded.updated_at,
        task_summary = excluded.task_summary,
        model_id = excluded.model_id,
        provider_name = excluded.provider_name,
        messages = excluded.messages,
        state = excluded.state,
        checkpoints = excluded.checkpoints,
        files_modified = excluded.files_modified,
        total_usage = excluded.total_usage
    `);

    stmt.run(
      session.id,
      session.projectId,
      session.workspaceId,
      session.status,
      session.createdAt,
      session.updatedAt,
      session.taskSummary ?? null,
      session.modelId,
      session.providerName,
      JSON.stringify(session.messages),
      JSON.stringify(session.state),
      JSON.stringify(session.checkpoints),
      JSON.stringify(session.filesModified),
      JSON.stringify(session.totalUsage),
    );
  }

  async findById(id: SessionId): Promise<StoredSession | null> {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return this.mapRowToSession(row);
  }

  async findLatestForProject(projectId: ProjectId, statuses?: SessionStatus[]): Promise<StoredSession | null> {
    let query = 'SELECT * FROM sessions WHERE project_id = ?';
    const params: any[] = [projectId];

    if (statuses && statuses.length > 0) {
      const placeholders = statuses.map(() => '?').join(',');
      query += ` AND status IN (${placeholders})`;
      params.push(...statuses);
    }

    query += ' ORDER BY updated_at DESC LIMIT 1';
    const stmt = this.db.prepare(query);
    const row = stmt.get(...params) as any;
    if (!row) return null;
    return this.mapRowToSession(row);
  }

  async listForProject(projectId: ProjectId, limit = 20): Promise<SessionSummary[]> {
    const stmt = this.db.prepare(`
      SELECT id, project_id, workspace_id, status, created_at, updated_at, task_summary, model_id, provider_name, files_modified, total_usage
      FROM sessions
      WHERE project_id = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `);
    const rows = stmt.all(projectId, limit) as any[];

    return rows.map((row) => ({
      id: row.id as SessionId,
      projectId: row.project_id as ProjectId,
      workspaceId: row.workspace_id as WorkspaceId,
      status: row.status as SessionStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      taskSummary: row.task_summary ?? undefined,
      modelId: row.model_id ?? undefined,
      providerName: row.provider_name ?? undefined,
      totalTokens: row.total_usage ? JSON.parse(row.total_usage) : undefined,
      filesModified: row.files_modified ? JSON.parse(row.files_modified) : [],
    }));
  }

  async delete(id: SessionId): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async saveCheckpoint(checkpoint: SessionCheckpoint): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO checkpoints (id, session_id, step_index, summary, state, files_modified, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        summary = excluded.summary,
        state = excluded.state,
        files_modified = excluded.files_modified,
        timestamp = excluded.timestamp
    `);
    stmt.run(
      checkpoint.id,
      checkpoint.sessionId,
      checkpoint.stepIndex,
      checkpoint.summary,
      JSON.stringify(checkpoint.state),
      JSON.stringify(checkpoint.filesModified),
      checkpoint.timestamp,
    );
  }

  async getCheckpoints(sessionId: SessionId): Promise<SessionCheckpoint[]> {
    const stmt = this.db.prepare('SELECT * FROM checkpoints WHERE session_id = ? ORDER BY step_index ASC');
    const rows = stmt.all(sessionId) as any[];
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id as SessionId,
      stepIndex: r.step_index,
      summary: r.summary,
      state: JSON.parse(r.state),
      filesModified: JSON.parse(r.files_modified),
      timestamp: r.timestamp,
    }));
  }

  private mapRowToSession(row: any): StoredSession {
    return {
      id: row.id as SessionId,
      projectId: row.project_id as ProjectId,
      workspaceId: row.workspace_id as WorkspaceId,
      status: row.status as SessionStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      taskSummary: row.task_summary ?? undefined,
      modelId: row.model_id,
      providerName: row.provider_name,
      messages: JSON.parse(row.messages),
      state: JSON.parse(row.state),
      checkpoints: JSON.parse(row.checkpoints),
      filesModified: JSON.parse(row.files_modified),
      totalUsage: JSON.parse(row.total_usage),
    };
  }
}
