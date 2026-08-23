/**
 * @sentinel/tools — Git tools
 *
 * Read-only Git operations exposed as agent tools.
 * Uses the @sentinel/git client for all Git operations.
 */

import { GitClient } from '@sentinel/git';
import type { ToolResult } from '@sentinel/core';
import type { Tool, ToolContext } from './registry.js';

// ─── git_status ──────────────────────────────────────────────────

export const gitStatusTool: Tool = {
  name: 'git_status',
  description: 'Show the current Git repository status: branch, staged/unstaged changes, untracked files.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  permissions: 'safe',

  async execute(_input: unknown, context: ToolContext): Promise<ToolResult> {
    const git = new GitClient(context.projectRoot);
    const status = await git.status();

    if (!status.isRepository) {
      return { success: true, output: 'Not a Git repository.', data: status };
    }

    const lines: string[] = [
      `Branch: ${status.branch}`,
    ];

    if (status.ahead > 0 || status.behind > 0) {
      lines.push(`Tracking: ${status.ahead} ahead, ${status.behind} behind`);
    }

    if (status.staged.length > 0) {
      lines.push(`\nStaged (${status.staged.length}):`);
      for (const f of status.staged) lines.push(`  ${f.status}: ${f.path}`);
    }

    if (status.unstaged.length > 0) {
      lines.push(`\nUnstaged (${status.unstaged.length}):`);
      for (const f of status.unstaged) lines.push(`  ${f.status}: ${f.path}`);
    }

    if (status.untracked.length > 0) {
      lines.push(`\nUntracked (${status.untracked.length}):`);
      for (const f of status.untracked) lines.push(`  ${f}`);
    }

    if (!status.hasChanges) {
      lines.push('\nWorking tree clean.');
    }

    return { success: true, output: lines.join('\n'), data: status };
  },
};

// ─── git_diff ────────────────────────────────────────────────────

export const gitDiffTool: Tool = {
  name: 'git_diff',
  description: 'Show Git diff output. Can show staged changes or changes for a specific file.',
  inputSchema: {
    type: 'object',
    properties: {
      staged: { type: 'boolean', description: 'Show staged changes. Default: false.' },
      file: { type: 'string', description: 'Show diff for a specific file. Optional.' },
    },
  },
  permissions: 'safe',

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const { staged, file } = (input ?? {}) as { staged?: boolean; file?: string };
    const git = new GitClient(context.projectRoot);
    const diff = await git.diff({ staged, file });

    if (!diff.trim()) {
      return { success: true, output: 'No differences found.' };
    }

    return { success: true, output: diff, data: { length: diff.length } };
  },
};

// ─── git_log ─────────────────────────────────────────────────────

export const gitLogTool: Tool = {
  name: 'git_log',
  description: 'Show recent Git commit history.',
  inputSchema: {
    type: 'object',
    properties: {
      count: { type: 'number', description: 'Number of commits to show. Default: 10.' },
    },
  },
  permissions: 'safe',

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const { count = 10 } = (input ?? {}) as { count?: number };
    const git = new GitClient(context.projectRoot);
    const entries = await git.log(count);

    if (entries.length === 0) {
      return { success: true, output: 'No commits found.' };
    }

    const formatted = entries.map((e) =>
      `${e.shortHash}  ${e.date.substring(0, 10)}  ${e.author}  ${e.message}`,
    ).join('\n');

    return {
      success: true,
      output: `Recent commits:\n${formatted}`,
      data: { entries },
    };
  },
};

// ─── git_branch ──────────────────────────────────────────────────

export const gitBranchTool: Tool = {
  name: 'git_branch',
  description: 'Show Git branch information: current branch and list of local/remote branches.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  permissions: 'safe',

  async execute(_input: unknown, context: ToolContext): Promise<ToolResult> {
    const git = new GitClient(context.projectRoot);
    const info = await git.branches();

    const lines = [
      `Current: ${info.current}`,
      `\nLocal branches: ${info.local.join(', ') || '(none)'}`,
    ];

    if (info.remote.length > 0) {
      lines.push(`Remote branches: ${info.remote.join(', ')}`);
    }

    return {
      success: true,
      output: lines.join('\n'),
      data: info,
    };
  },
};
