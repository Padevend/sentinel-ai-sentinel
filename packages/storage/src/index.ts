/**
 * @sentinel/storage — Storage abstraction, SQLite adapter, migrations, and repositories
 *
 * Provides transactional persistence for Sentinel:
 * projects, workspaces, persistent sessions, checkpoints, metadata, and memory entries.
 */

export type { StorageAdapter } from './storage-adapter.js';
export { SQLiteStorageAdapter, InMemoryStorageAdapter } from './storage-adapter.js';
export { SchemaMigrationRunner, type Migration } from './migrations.js';
export {
  SQLiteRepositories,
  type ProjectRepository,
  type WorkspaceRepository,
  type SessionRepository,
} from './repositories.js';
