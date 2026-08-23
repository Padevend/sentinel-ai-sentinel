/**
 * @sentinel/git — Git abstraction layer
 *
 * Wraps Git CLI operations with structured output, safety checks,
 * and proper error handling. Never executes destructive Git commands
 * without explicit authorization.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GitError, createLogger } from '@sentinel/core';

const execFileAsync = promisify(execFile);
const logger = createLogger('git');

// ─── Types ───────────────────────────────────────────────────────

export interface GitStatus {
  readonly isRepository: boolean;
  readonly branch: string;
  readonly ahead: number;
  readonly behind: number;
  readonly staged: readonly FileStatus[];
  readonly unstaged: readonly FileStatus[];
  readonly untracked: readonly string[];
  readonly hasChanges: boolean;
}

export interface FileStatus {
  readonly path: string;
  readonly status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
}

export interface GitLogEntry {
  readonly hash: string;
  readonly shortHash: string;
  readonly author: string;
  readonly date: string;
  readonly message: string;
}

export interface GitBranchInfo {
  readonly current: string;
  readonly local: readonly string[];
  readonly remote: readonly string[];
}

// ─── Git Client ──────────────────────────────────────────────────

/**
 * Abstraction over the Git CLI.
 * All operations are scoped to a specific working directory.
 */
export class GitClient {
  constructor(private readonly cwd: string) {}

  /**
   * Check if the current directory is inside a Git repository.
   */
  async isRepository(): Promise<boolean> {
    try {
      await this.exec(['rev-parse', '--is-inside-work-tree']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the repository root directory.
   */
  async getRoot(): Promise<string> {
    const result = await this.exec(['rev-parse', '--show-toplevel']);
    return result.trim();
  }

  /**
   * Get comprehensive repository status.
   */
  async status(): Promise<GitStatus> {
    const isRepo = await this.isRepository();
    if (!isRepo) {
      return {
        isRepository: false,
        branch: '',
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        untracked: [],
        hasChanges: false,
      };
    }

    const [branchOutput, statusOutput] = await Promise.all([
      this.exec(['branch', '--show-current']).catch(() => ''),
      this.exec(['status', '--porcelain=v1', '-b']),
    ]);

    const branch = branchOutput.trim();
    const lines = statusOutput.trim().split('\n').filter(Boolean);

    // Parse branch tracking info
    let ahead = 0;
    let behind = 0;
    const branchLine = lines[0];
    if (branchLine?.startsWith('##')) {
      const trackingMatch = branchLine.match(/\[ahead (\d+)(?:, behind (\d+))?\]/);
      const behindMatch = branchLine.match(/\[behind (\d+)\]/);
      if (trackingMatch) {
        ahead = parseInt(trackingMatch[1] ?? '0', 10);
        behind = parseInt(trackingMatch[2] ?? '0', 10);
      } else if (behindMatch) {
        behind = parseInt(behindMatch[1] ?? '0', 10);
      }
    }

    const staged: FileStatus[] = [];
    const unstaged: FileStatus[] = [];
    const untracked: string[] = [];

    for (const line of lines.slice(1)) {
      const indexStatus = line[0];
      const workTreeStatus = line[1];
      const filePath = line.slice(3).trim();

      if (indexStatus === '?' && workTreeStatus === '?') {
        untracked.push(filePath);
      } else {
        if (indexStatus && indexStatus !== ' ' && indexStatus !== '?') {
          staged.push({ path: filePath, status: this.mapStatus(indexStatus) });
        }
        if (workTreeStatus && workTreeStatus !== ' ' && workTreeStatus !== '?') {
          unstaged.push({ path: filePath, status: this.mapStatus(workTreeStatus) });
        }
      }
    }

    return {
      isRepository: true,
      branch,
      ahead,
      behind,
      staged,
      unstaged,
      untracked,
      hasChanges: staged.length > 0 || unstaged.length > 0 || untracked.length > 0,
    };
  }

  /**
   * Get diff output.
   */
  async diff(options?: { staged?: boolean; file?: string }): Promise<string> {
    const args = ['diff'];
    if (options?.staged) args.push('--staged');
    if (options?.file) args.push('--', options.file);
    return this.exec(args);
  }

  /**
   * Get log entries.
   */
  async log(count: number = 10): Promise<GitLogEntry[]> {
    const format = '%H%n%h%n%an%n%aI%n%s';
    const output = await this.exec([
      'log',
      `--format=${format}`,
      `-n${count}`,
    ]);

    const lines = output.trim().split('\n');
    const entries: GitLogEntry[] = [];

    for (let i = 0; i + 4 < lines.length; i += 5) {
      entries.push({
        hash: lines[i]!,
        shortHash: lines[i + 1]!,
        author: lines[i + 2]!,
        date: lines[i + 3]!,
        message: lines[i + 4]!,
      });
    }

    return entries;
  }

  /**
   * Get branch information.
   */
  async branches(): Promise<GitBranchInfo> {
    const [currentOutput, localOutput, remoteOutput] = await Promise.all([
      this.exec(['branch', '--show-current']).catch(() => ''),
      this.exec(['branch', '--list', '--format=%(refname:short)']).catch(() => ''),
      this.exec(['branch', '-r', '--format=%(refname:short)']).catch(() => ''),
    ]);

    return {
      current: currentOutput.trim(),
      local: localOutput.trim().split('\n').filter(Boolean),
      remote: remoteOutput.trim().split('\n').filter(Boolean),
    };
  }

  // ─── Internal ──────────────────────────────────────────────────

  private async exec(args: string[]): Promise<string> {
    try {
      logger.debug(`git ${args.join(' ')}`, { cwd: this.cwd });
      const { stdout } = await execFileAsync('git', args, {
        cwd: this.cwd,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        timeout: 30_000,
      });
      return stdout;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError(`Git command failed: git ${args.join(' ')} — ${message}`, {
        cause: error,
        metadata: { args, cwd: this.cwd },
      });
    }
  }

  private mapStatus(char: string): FileStatus['status'] {
    switch (char) {
      case 'A': return 'added';
      case 'M': return 'modified';
      case 'D': return 'deleted';
      case 'R': return 'renamed';
      case 'C': return 'copied';
      default: return 'modified';
    }
  }
}

export { GitClient as default };
