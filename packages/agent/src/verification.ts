/**
 * @sentinel/agent — Verification Engine
 *
 * Automatically detects and executes test suites after modifications,
 * extracts failed tests and error details, and assists in auto-correction loops.
 */

import { executeCommandTool } from '@sentinel/tools';
import type { ToolContext } from '@sentinel/tools';
import { SentinelEventBus } from '@sentinel/core';
import type { PermissionManager } from '@sentinel/permissions';
import type { VerificationResult } from './types.js';

export class VerificationEngine {
  constructor(
    private readonly projectRoot: string,
    private readonly permissions: PermissionManager,
  ) {}

  /**
   * Run verification tests for the project.
   */
  async verify(testCommand?: string, signal?: AbortSignal): Promise<VerificationResult> {
    const command = testCommand || (await this.detectTestCommand());
    const permissionCheck = this.permissions.check('execute_command', { command });
    if (permissionCheck.decision !== 'allow') {
      const approved = await this.permissions.requestConfirmation(permissionCheck);
      if (!approved) {
        return {
          passed: false,
          output: `Verification was not run: permission denied for "${command}".`,
        };
      }
      this.permissions.recordSessionOverride(permissionCheck.request, 'allow');
    }

    const context: ToolContext = {
      projectRoot: this.projectRoot,
      eventBus: new SentinelEventBus(),
      signal,
      permissionEngine: this.permissions,
    };

    const result = await executeCommandTool.execute({ command }, context);
    const passed = result.success;
    const output = result.output;

    const failedTests = this.extractFailedTests(output);

    return {
      passed,
      output,
      failedTests: failedTests.length > 0 ? failedTests : undefined,
      suggestedFix: passed ? undefined : this.extractDiagnosticHint(output),
    };
  }

  private async detectTestCommand(): Promise<string> {
    // Default fallback to npm test or vitest
    return 'npm test';
  }

  private extractFailedTests(output: string): string[] {
    const failed: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.includes('FAIL') || line.includes('✕') || line.includes('failed')) {
        const trimmed = line.trim();
        if (trimmed.length > 5 && trimmed.length < 150) {
          failed.push(trimmed);
        }
      }
    }

    return failed;
  }

  private extractDiagnosticHint(output: string): string | undefined {
    if (output.includes('SyntaxError')) return 'Check for syntax or compilation errors in recently modified files.';
    if (output.includes('TypeError')) return 'Check for type mismatches, null values, or missing properties.';
    if (output.includes('AssertionError') || output.includes('expected')) return 'Test assertion failed. Check business logic expectations.';
    return undefined;
  }
}
