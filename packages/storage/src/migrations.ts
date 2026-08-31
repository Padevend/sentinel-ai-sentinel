/**
 * @sentinel/storage — SQLite Schema Migration Engine
 *
 * Automatically tracks and applies versioned database schema migrations.
 */

import Database from 'better-sqlite3';
import { createLogger, StorageError } from '@sentinel/core';

const logger = createLogger('storage:migrations');

export interface Migration {
  readonly version: number;
  readonly name: string;
  up(db: Database.Database): void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_runtime_schema',
    up(db: Database.Database) {
      db.exec(`
        -- Projects table
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          canonical_path TEXT NOT NULL,
          git_remote TEXT,
          created_at INTEGER NOT NULL,
          last_seen_at INTEGER NOT NULL,
          metadata TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(canonical_path);

        -- Workspaces table
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          project_root TEXT NOT NULL,
          project_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          last_active_at INTEGER NOT NULL,
          config TEXT,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_workspaces_root ON workspaces(project_root);

        -- Sessions table
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          workspace_id TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          task_summary TEXT,
          model_id TEXT,
          provider_name TEXT,
          messages TEXT NOT NULL,
          state TEXT NOT NULL,
          checkpoints TEXT NOT NULL,
          files_modified TEXT NOT NULL,
          total_usage TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

        -- Checkpoints table
        CREATE TABLE IF NOT EXISTS checkpoints (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          step_index INTEGER NOT NULL,
          summary TEXT NOT NULL,
          state TEXT NOT NULL,
          files_modified TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id, step_index);
      `);
    },
  },
];

export class SchemaMigrationRunner {
  static runMigrations(db: Database.Database): void {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS _schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL
        );
      `);

      const rows = db.prepare('SELECT version FROM _schema_migrations').all() as Array<{ version: number }>;
      const appliedVersions = new Set(rows.map((r) => r.version));

      const insertStmt = db.prepare(
        'INSERT INTO _schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
      );

      for (const migration of MIGRATIONS) {
        if (!appliedVersions.has(migration.version)) {
          logger.info(`Applying migration v${migration.version}: ${migration.name}`);

          const runInTransaction = db.transaction(() => {
            migration.up(db);
            insertStmt.run(migration.version, migration.name, Date.now());
          });

          runInTransaction();
          logger.info(`Applied migration v${migration.version} successfully`);
        }
      }
    } catch (err) {
      throw new StorageError(
        `Failed to run database migrations: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  }
}
