/**
 * @sentinel/tools — Filesystem tools
 *
 * Read-only and write operations on the filesystem.
 * All paths are resolved and validated to prevent directory traversal.
 */

import { readFile, readdir, writeFile, unlink, stat, realpath } from 'node:fs/promises';
import { resolve, relative, join, isAbsolute, dirname, basename } from 'node:path';
import type { ToolResult } from '@sentinel/core';
import { createPermissionRequest } from '@sentinel/permissions';
import type { Tool, ToolContext } from './registry.js';

// ─── Path safety ─────────────────────────────────────────────────

function safePath(projectRoot: string, filePath: string): string {
  const resolved = isAbsolute(filePath) ? filePath : resolve(projectRoot, filePath);
  const rel = relative(projectRoot, resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path "${filePath}" is outside the project root.`);
  }
  return resolved;
}

async function safePathForOperation(projectRoot: string, filePath: string): Promise<string> {
  const lexicalPath = safePath(projectRoot, filePath);
  const rootPath = await realpath(projectRoot);
  let probe = lexicalPath;
  const missingSegments: string[] = [];
  let canonicalPath: string | undefined;
  while (!canonicalPath) {
    try {
      const existing = await realpath(probe);
      canonicalPath = join(existing, ...missingSegments.reverse());
    } catch {
      const parent = dirname(probe);
      if (parent === probe) throw new Error(`Path "${filePath}" could not be resolved safely.`);
      missingSegments.push(basename(probe));
      probe = parent;
    }
  }
  const canonicalRelative = relative(rootPath, canonicalPath);
  if (canonicalRelative.startsWith('..') || isAbsolute(canonicalRelative)) {
    throw new Error(`Path "${filePath}" resolves outside the project root.`);
  }
  return canonicalPath;
}

// ─── list_directory ──────────────────────────────────────────────

export const listDirectoryTool: Tool = {
  name: 'list_directory',
  description: 'List files and directories at the given path. Returns names with type indicators (file/directory). Use to explore project structure.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path relative to project root. Use "." for root.' },
      recursive: { type: 'boolean', description: 'If true, list recursively (max depth 3). Default: false.' },
    },
    required: ['path'],
  },
  permissions: 'safe',

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const { path: dirPath = '.', recursive = false } = input as { path?: string; recursive?: boolean };

    try {
      const resolved = await safePathForOperation(context.projectRoot, dirPath);
      const entries = await readdir(resolved, { withFileTypes: true });
      const results: string[] = [];

      for (const entry of entries) {
        // Skip common non-essential directories
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
          results.push(`📁 ${entry.name}/  (skipped)`);
          continue;
        }

        if (entry.isDirectory()) {
          results.push(`📁 ${entry.name}/`);
          if (recursive) {
            await listRecursive(join(resolved, entry.name), entry.name, results, 1, 3, context.projectRoot);
          }
        } else {
          const fileStat = await stat(join(resolved, entry.name)).catch(() => null);
          const size = fileStat ? formatSize(fileStat.size) : '';
          results.push(`📄 ${entry.name}  ${size}`);
        }
      }

      return {
        success: true,
        output: results.length > 0
          ? `Contents of ${dirPath}:\n${results.join('\n')}`
          : `Directory ${dirPath} is empty.`,
        data: { fileCount: results.length },
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to list directory "${dirPath}": ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

async function listRecursive(
  dir: string,
  prefix: string,
  results: string[],
  depth: number,
  maxDepth: number,
  projectRoot: string,
): Promise<void> {
  if (depth >= maxDepth) return;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const relPath = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        results.push(`${'  '.repeat(depth)}📁 ${relPath}/`);
        await listRecursive(join(dir, entry.name), relPath, results, depth + 1, maxDepth, projectRoot);
      } else {
        results.push(`${'  '.repeat(depth)}📄 ${relPath}`);
      }
    }
  } catch {
    // Ignore permission errors
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ─── read_file ───────────────────────────────────────────────────

export const readFileTool: Tool = {
  name: 'read_file',
  description: 'Read the contents of a file. Optionally specify line range. Returns file content with line numbers.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to project root.' },
      startLine: { type: 'number', description: 'Start line (1-indexed, inclusive). Optional.' },
      endLine: { type: 'number', description: 'End line (1-indexed, inclusive). Optional.' },
    },
    required: ['path'],
  },
  permissions: 'safe',

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const { path: filePath, startLine, endLine } = input as { path: string; startLine?: number; endLine?: number };

    try {
      const resolved = await safePathForOperation(context.projectRoot, filePath);
      const content = await readFile(resolved, 'utf-8');
      const lines = content.split('\n');
      const totalLines = lines.length;

      let selectedLines = lines;
      let rangeInfo = '';

      if (startLine !== undefined || endLine !== undefined) {
        const start = Math.max(1, startLine ?? 1) - 1;
        const end = Math.min(totalLines, endLine ?? totalLines);
        selectedLines = lines.slice(start, end);
        rangeInfo = ` (lines ${start + 1}-${end} of ${totalLines})`;
      }

      // Add line numbers
      const startIdx = (startLine ?? 1) - 1;
      const numbered = selectedLines.map((line, i) =>
        `${String(startIdx + i + 1).padStart(4)} │ ${line}`,
      ).join('\n');

      return {
        success: true,
        output: `File: ${filePath}${rangeInfo}\n${'─'.repeat(60)}\n${numbered}`,
        data: { totalLines, path: filePath },
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to read "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

// ─── search_text ─────────────────────────────────────────────────

export const searchTextTool: Tool = {
  name: 'search_text',
  description: 'Search for text or patterns across project files. Returns matching lines with file paths and line numbers. Similar to grep.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Text pattern to search for.' },
      path: { type: 'string', description: 'Directory to search in, relative to project root. Default: "."' },
      filePattern: { type: 'string', description: 'Glob pattern to filter files (e.g., "*.ts"). Optional.' },
      caseSensitive: { type: 'boolean', description: 'Case-sensitive search. Default: true.' },
      maxResults: { type: 'number', description: 'Maximum number of results. Default: 50.' },
    },
    required: ['pattern'],
  },
  permissions: 'safe',

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const {
      pattern,
      path: searchPath = '.',
      caseSensitive = true,
      maxResults = 50,
    } = input as {
      pattern: string;
      path?: string;
      filePattern?: string;
      caseSensitive?: boolean;
      maxResults?: number;
    };

    try {
      const resolved = await safePathForOperation(context.projectRoot, searchPath);
      const results = await searchInDirectory(resolved, pattern, caseSensitive, maxResults, context.projectRoot);

      if (results.length === 0) {
        return {
          success: true,
          output: `No matches found for "${pattern}".`,
          data: { matchCount: 0 },
        };
      }

      const formatted = results.map((r) =>
        `${r.file}:${r.line}  ${r.content.trim()}`,
      ).join('\n');

      return {
        success: true,
        output: `Found ${results.length} matches for "${pattern}":\n${formatted}`,
        data: { matchCount: results.length, matches: results },
      };
    } catch (error) {
      return {
        success: false,
        output: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

interface SearchMatch {
  file: string;
  line: number;
  content: string;
}

async function searchInDirectory(
  dir: string,
  pattern: string,
  caseSensitive: boolean,
  maxResults: number,
  projectRoot: string,
): Promise<SearchMatch[]> {
  const results: SearchMatch[] = [];
  const regex = new RegExp(escapeRegex(pattern), caseSensitive ? 'g' : 'gi');

  async function walk(currentDir: string): Promise<void> {
    if (results.length >= maxResults) return;

    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxResults) return;
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;

      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        // Only search text files
        if (isBinaryExtension(entry.name)) continue;
        try {
          const content = await readFile(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length && results.length < maxResults; i++) {
            if (regex.test(lines[i]!)) {
              results.push({
                file: relative(projectRoot, fullPath),
                line: i + 1,
                content: lines[i]!,
              });
            }
            regex.lastIndex = 0;
          }
        } catch {
          // Skip files that can't be read
        }
      }
    }
  }

  await walk(dir);
  return results;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isBinaryExtension(name: string): boolean {
  const binaryExts = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
    '.woff', '.woff2', '.ttf', '.eot',
    '.zip', '.tar', '.gz', '.bz2',
    '.exe', '.dll', '.so', '.dylib',
    '.pdf', '.doc', '.docx',
    '.mp3', '.mp4', '.avi', '.mov',
    '.db', '.sqlite', '.sqlite3',
    '.lock',
  ]);
  const ext = name.substring(name.lastIndexOf('.'));
  return binaryExts.has(ext);
}

// ─── write_file ──────────────────────────────────────────────────

export const writeFileTool: Tool = {
  name: 'write_file',
  description: 'Create or overwrite a file with the given content. Creates parent directories if needed.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to project root.' },
      content: { type: 'string', description: 'The full content to write to the file.' },
    },
    required: ['path', 'content'],
  },
  permissions: 'confirm_recommended',

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const permissionError = requireWritePermission('write_file', input, context);
    if (permissionError) return permissionError;
    const { path: filePath, content } = input as { path: string; content: string };

    try {
      const resolved = await safePathForOperation(context.projectRoot, filePath);
      const { mkdir } = await import('node:fs/promises');
      const { dirname } = await import('node:path');
      await mkdir(dirname(resolved), { recursive: true });
      await writeFile(resolved, content, 'utf-8');

      const lineCount = content.split('\n').length;
      return {
        success: true,
        output: `File written: ${filePath} (${lineCount} lines)`,
        data: { path: filePath, lineCount },
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to write "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

// ─── patch_file ──────────────────────────────────────────────────

export const patchFileTool: Tool = {
  name: 'patch_file',
  description: 'Apply targeted modifications to a file by replacing specific text. Preferred over write_file for small changes — avoids rewriting entire files.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to project root.' },
      patches: {
        type: 'array',
        description: 'Array of patches to apply.',
        items: {
          type: 'object',
          properties: {
            search: { type: 'string', description: 'Exact text to find.' },
            replace: { type: 'string', description: 'Text to replace it with.' },
          },
          required: ['search', 'replace'],
        },
      },
    },
    required: ['path', 'patches'],
  },
  permissions: 'confirm_recommended',

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const permissionError = requireWritePermission('patch_file', input, context);
    if (permissionError) return permissionError;
    const { path: filePath, patches } = input as {
      path: string;
      patches: Array<{ search: string; replace: string }>;
    };

    try {
      const resolved = await safePathForOperation(context.projectRoot, filePath);
      let content = await readFile(resolved, 'utf-8');
      const applied: string[] = [];
      const failed: string[] = [];

      for (const patch of patches) {
        if (content.includes(patch.search)) {
          content = content.replace(patch.search, patch.replace);
          applied.push(`  ✓ Replaced: "${truncate(patch.search, 50)}" → "${truncate(patch.replace, 50)}"`);
        } else {
          failed.push(`  ✗ Not found: "${truncate(patch.search, 50)}"`);
        }
      }

      if (applied.length > 0) {
        await writeFile(resolved, content, 'utf-8');
      }

      const summary = [
        `Patch results for ${filePath}:`,
        ...applied,
        ...failed,
      ].join('\n');

      return {
        success: failed.length === 0,
        output: summary,
        data: { applied: applied.length, failed: failed.length },
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to patch "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '…';
}

// ─── delete_file ─────────────────────────────────────────────────

export const deleteFileTool: Tool = {
  name: 'delete_file',
  description: 'Delete a file. This is a destructive operation and always requires confirmation.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to project root.' },
    },
    required: ['path'],
  },
  permissions: 'confirm_required',

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const permissionError = requireWritePermission('delete_file', input, context);
    const { path: filePath } = input as { path: string };
    if (permissionError) return permissionError;

    try {
      const resolved = await safePathForOperation(context.projectRoot, filePath);
      await unlink(resolved);
      return {
        success: true,
        output: `Deleted: ${filePath}`,
        data: { path: filePath },
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to delete "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

function requireWritePermission(
  toolName: 'write_file' | 'patch_file' | 'delete_file',
  input: unknown,
  context: ToolContext,
): ToolResult | undefined {
  if (!context.permissionEngine) {
    return {
      success: false,
      output: `Tool "${toolName}" requires an active permission engine.`,
      error: {
        code: 'PERMISSION_REQUIRED',
        message: 'Filesystem writes are denied when no permission engine is attached.',
        recoverable: true,
        retryable: false,
      },
    };
  }

  const decision = context.permissionEngine.evaluate(createPermissionRequest(toolName, input));
  if (decision === 'allow') return undefined;
  return {
    success: false,
    output: decision === 'ask'
      ? `Permission required before executing tool "${toolName}".`
      : `Tool "${toolName}" denied by the active permission policy.`,
    error: {
      code: decision === 'ask' ? 'PERMISSION_REQUIRED' : 'PERMISSION_DENIED',
      message: decision === 'ask' ? 'User confirmation is required.' : 'Permission policy denied the request.',
      recoverable: true,
      retryable: false,
    },
  };
}
