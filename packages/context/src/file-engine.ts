import { watch, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';

export interface FileMatch {
  readonly path: string;
  readonly score: number;
}

export interface FileContextEngineOptions {
  readonly watcher?: boolean;
}

/**
 * In-memory workspace path index for @file completion. Querying never touches
 * the filesystem; only the watcher or an explicit refresh updates the index.
 */
export class FileContextEngine {
  private paths: readonly string[] = [];
  private watcher?: ReturnType<typeof watch>;

  constructor(
    private readonly workspaceRoot: string,
    options: FileContextEngineOptions = {},
  ) {
    this.refreshIndex();
    if (options.watcher ?? true) this.startWatcher();
  }

  search(query: string, limit = 10): FileMatch[] {
    const normalized = query.trim().toLowerCase();
    return this.paths
      .map((path) => ({ path, score: fuzzyScore(normalized, path.toLowerCase()) }))
      .filter((match) => normalized.length === 0 || match.score > 0)
      .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
      .slice(0, limit);
  }

  refreshIndex(): void {
    const result = spawnSync('rg', ['--files'], {
      cwd: this.workspaceRoot,
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.status === 0 && typeof result.stdout === 'string') {
      this.paths = normalizePaths(result.stdout.split(/\r?\n/));
      return;
    }
    this.paths = collectFallbackPaths(this.workspaceRoot);
  }

  close(): void {
    this.watcher?.close();
    this.watcher = undefined;
  }

  private startWatcher(): void {
    try {
      this.watcher = watch(this.workspaceRoot, { recursive: process.platform === 'win32' }, () => this.refreshIndex());
      this.watcher.on('error', () => {
        this.watcher?.close();
        this.watcher = undefined;
      });
    } catch {
      // Explicit refresh remains available on platforms without recursive watch.
    }
  }
}

function normalizePaths(paths: readonly string[]): string[] {
  return [...new Set(paths
    .map((path) => path.trim().replace(/\\/g, '/'))
    .filter((path) => path.length > 0))];
}

function fuzzyScore(query: string, candidate: string): number {
  if (!query) return 1;
  let queryIndex = 0;
  let score = 0;
  let run = 0;
  let previousIndex = -2;
  for (let index = 0; index < candidate.length && queryIndex < query.length; index++) {
    if (candidate[index] !== query[queryIndex]) continue;
    run = index === previousIndex + 1 ? run + 1 : 1;
    score += 10 + run * 4;
    if (index === 0 || '/_-'.includes(candidate[index] ?? '')) score += 8;
    previousIndex = index;
    queryIndex++;
  }
  return queryIndex === query.length ? score - (candidate.length - query.length) * 0.01 : 0;
}

function collectFallbackPaths(root: string): string[] {
  const result: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.sentinel') continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (statSync(absolute).isFile()) result.push(relative(root, absolute).replace(/\\/g, '/'));
    }
  };
  try { visit(root); } catch { return []; }
  return normalizePaths(result);
}
