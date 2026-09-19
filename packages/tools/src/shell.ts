/**
 * @sentinel/tools — Shell execution tool
 *
 * Controlled command execution with timeout, output capture,
 * and security checks. Never gives the LLM unlimited shell access.
 */

import { spawn } from 'node:child_process';
import { relative, resolve, isAbsolute } from 'node:path';
import type { ToolResult } from '@sentinel/core';
import { createPermissionRequest } from '@sentinel/permissions';
import type { Tool, ToolContext } from './registry.js';

const DEFAULT_TIMEOUT_MS = 60_000; // 1 minute
const MAX_OUTPUT_LENGTH = 50_000; // 50KB of output

export const executeCommandTool: Tool = {
  name: 'execute_command',
  description: 'Execute a shell command in the project directory. Returns stdout, stderr, and exit code. Use for running tests, builds, scripts, and other CLI operations.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The command to execute (e.g., "npm test", "git status").' },
      cwd: { type: 'string', description: 'Working directory relative to project root. Default: project root.' },
      timeout: { type: 'number', description: 'Timeout in milliseconds. Default: 60000.' },
    },
    required: ['command'],
  },
  permissions: 'confirm_recommended',

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    if (!context.permissionEngine) {
      return {
        success: false,
        output: 'Shell execution requires an active permission engine.',
        error: {
          code: 'PERMISSION_REQUIRED',
          message: 'Shell commands are denied when no permission engine is attached.',
          recoverable: true,
          retryable: false,
        },
      };
    }

    const permissionDecision = context.permissionEngine.evaluate(createPermissionRequest('execute_command', input));
    if (permissionDecision !== 'allow') {
      return {
        success: false,
        output: permissionDecision === 'ask'
          ? 'Permission required before executing a shell command.'
          : 'Shell command denied by the active permission policy.',
        error: {
          code: permissionDecision === 'ask' ? 'PERMISSION_REQUIRED' : 'PERMISSION_DENIED',
          message: permissionDecision === 'ask' ? 'User confirmation is required.' : 'Permission policy denied the request.',
          recoverable: true,
          retryable: false,
        },
      };
    }

    const {
      command,
      cwd,
      timeout = DEFAULT_TIMEOUT_MS,
    } = input as { command: string; cwd?: string; timeout?: number };

    const workDir = cwd ? resolve(context.projectRoot, cwd) : context.projectRoot;
    const relativeWorkDir = relative(context.projectRoot, workDir);
    if (isAbsolute(relativeWorkDir) || relativeWorkDir.startsWith('..')) {
      return {
        success: false,
        output: `Command rejected: working directory "${cwd}" is outside the project root.`,
        error: {
          code: 'WORKSPACE_ESCAPE',
          message: 'Shell working directory must remain inside the project root.',
          recoverable: false,
          retryable: false,
        },
      };
    }

    try {
      const result = await runCommand(command, workDir, timeout, context.signal);

      const output = [
        `$ ${command}`,
        result.stdout ? `stdout:\n${truncateOutput(result.stdout)}` : '',
        result.stderr ? `stderr:\n${truncateOutput(result.stderr)}` : '',
        `Exit code: ${result.exitCode}`,
      ].filter(Boolean).join('\n\n');

      return {
        success: result.exitCode === 0,
        output,
        data: {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        },
      };
    } catch (error) {
      return {
        success: false,
        output: `Command failed: ${error instanceof Error ? error.message : String(error)}`,
        error: {
          code: 'COMMAND_EXECUTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
          retryable: false,
        },
      };
    }
  },
};

// ─── Internal ────────────────────────────────────────────────────

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runCommand(
  command: string,
  cwd: string,
  timeout: number,
  signal?: AbortSignal,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    // Use shell execution for compatibility
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/c', command] : ['-c', command];

    const proc = spawn(shell, shellArgs, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout,
      env: {
        ...process.env,
        // Force non-interactive mode
        CI: 'true',
        FORCE_COLOR: '0',
      },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
      // Prevent unbounded memory usage
      if (stdout.length > MAX_OUTPUT_LENGTH * 2) {
        stdout = stdout.substring(stdout.length - MAX_OUTPUT_LENGTH);
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > MAX_OUTPUT_LENGTH * 2) {
        stderr = stderr.substring(stderr.length - MAX_OUTPUT_LENGTH);
      }
    });

    // Handle abort signal
    const abortHandler = () => {
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL');
      }, 5000);
    };

    signal?.addEventListener('abort', abortHandler, { once: true });

    proc.on('close', (code) => {
      signal?.removeEventListener('abort', abortHandler);
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    proc.on('error', (error) => {
      signal?.removeEventListener('abort', abortHandler);
      reject(error);
    });
  });
}

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_LENGTH) return output;
  return output.substring(0, MAX_OUTPUT_LENGTH) + '\n... (output truncated)';
}
