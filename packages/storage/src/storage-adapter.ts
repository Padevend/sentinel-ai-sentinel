/**
 * @sentinel/storage — Key-Value Storage Adapters
 */

import Database from 'better-sqlite3';
import { StorageError, createLogger } from '@sentinel/core';

const logger = createLogger('storage:adapter');

export interface StorageAdapter {
  get<T>(collection: string, key: string): Promise<T | null>;
  set<T>(collection: string, key: string, value: T): Promise<void>;
  delete(collection: string, key: string): Promise<boolean>;
  list<T>(collection: string): Promise<Array<{ key: string; value: T }>>;
  query<T>(collection: string, filter: (value: T) => boolean): Promise<T[]>;
  close(): Promise<void>;
}

export class SQLiteStorageAdapter implements StorageAdapter {
  private readonly db: Database.Database;
  private readonly knownTables = new Set<string>();

  constructor(dbPath: string) {
    try {
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
    } catch (error) {
      throw new StorageError(
        `Failed to initialize SQLite database at ${dbPath}`,
        { cause: error },
      );
    }
  }

  async get<T>(collection: string, key: string): Promise<T | null> {
    this.ensureTable(collection);
    const stmt = this.db.prepare(`SELECT value FROM "${collection}" WHERE key = ?`);
    const row = stmt.get(key) as { value: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return null;
    }
  }

  async set<T>(collection: string, key: string, value: T): Promise<void> {
    this.ensureTable(collection);
    const json = JSON.stringify(value);
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO "${collection}" (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
    );
    stmt.run(key, json);
  }

  async delete(collection: string, key: string): Promise<boolean> {
    this.ensureTable(collection);
    const stmt = this.db.prepare(`DELETE FROM "${collection}" WHERE key = ?`);
    const result = stmt.run(key);
    return result.changes > 0;
  }

  async list<T>(collection: string): Promise<Array<{ key: string; value: T }>> {
    this.ensureTable(collection);
    const stmt = this.db.prepare(`SELECT key, value FROM "${collection}" ORDER BY updated_at DESC`);
    const rows = stmt.all() as Array<{ key: string; value: string }>;
    return rows.map((row) => ({
      key: row.key,
      value: JSON.parse(row.value) as T,
    }));
  }

  async query<T>(collection: string, filter: (value: T) => boolean): Promise<T[]> {
    const all = await this.list<T>(collection);
    return all.filter((item) => filter(item.value)).map((item) => item.value);
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private ensureTable(collection: string): void {
    if (this.knownTables.has(collection)) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "${collection}" (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    this.knownTables.add(collection);
  }
}

export class InMemoryStorageAdapter implements StorageAdapter {
  private readonly store = new Map<string, Map<string, string>>();

  async get<T>(collection: string, key: string): Promise<T | null> {
    const col = this.store.get(collection);
    const raw = col?.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async set<T>(collection: string, key: string, value: T): Promise<void> {
    if (!this.store.has(collection)) {
      this.store.set(collection, new Map());
    }
    this.store.get(collection)!.set(key, JSON.stringify(value));
  }

  async delete(collection: string, key: string): Promise<boolean> {
    return this.store.get(collection)?.delete(key) ?? false;
  }

  async list<T>(collection: string): Promise<Array<{ key: string; value: T }>> {
    const col = this.store.get(collection);
    if (!col) return [];
    return [...col.entries()].map(([key, raw]) => ({
      key,
      value: JSON.parse(raw) as T,
    }));
  }

  async query<T>(collection: string, filter: (value: T) => boolean): Promise<T[]> {
    const all = await this.list<T>(collection);
    return all.filter((item) => filter(item.value)).map((item) => item.value);
  }

  async close(): Promise<void> {
    this.store.clear();
  }
}
