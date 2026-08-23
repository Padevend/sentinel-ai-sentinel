/**
 * @sentinel/permissions — Permission Manager
 *
 * Three-tier permission system controlling tool execution safety.
 * The agent never executes tools blindly — each operation is classified
 * and may require user confirmation before proceeding.
 */

import type { PermissionLevel } from '@sentinel/core';

// ─── Types ───────────────────────────────────────────────────────

export interface PermissionCheck {
  readonly toolName: string;
  readonly level: PermissionLevel;
  readonly requiresConfirmation: boolean;
  readonly reason: string;
}

export interface PermissionPolicy {
  readonly defaultLevel: PermissionLevel;
  readonly overrides: readonly PermissionOverride[];
  readonly blockedCommands: readonly string[];
  readonly allowedCommands: readonly string[];
}

export interface PermissionOverride {
  readonly tool: string;
  readonly level: PermissionLevel;
}

export type ConfirmationHandler = (check: PermissionCheck) => Promise<boolean>;

// ─── Default tool classifications ────────────────────────────────

const DEFAULT_TOOL_PERMISSIONS: Record<string, PermissionLevel> = {
  // Safe — read-only, no side effects
  'read_file': 'safe',
  'list_directory': 'safe',
  'search_text': 'safe',
  'git_status': 'safe',
  'git_diff': 'safe',
  'git_log': 'safe',
  'git_branch': 'safe',
  'detect_project': 'safe',

  // Confirm recommended — writes, potentially impactful
  'write_file': 'confirm_recommended',
  'patch_file': 'confirm_recommended',
  'execute_command': 'confirm_recommended',

  // Confirm required — destructive operations
  'delete_file': 'confirm_required',
};

// Commands that are always blocked
const ALWAYS_BLOCKED_COMMANDS = [
  'rm -rf /',
  'format',
  'mkfs',
  'dd if=',
  ':(){:|:&};:',  // fork bomb
];

// ─── Permission Manager ─────────────────────────────────────────

/**
 * Controls whether and how tools are allowed to execute.
 * Extensible via policy overrides and confirmation handlers.
 */
export class PermissionManager {
  private readonly policy: PermissionPolicy;
  private confirmationHandler: ConfirmationHandler | null = null;

  constructor(policy?: Partial<PermissionPolicy>) {
    this.policy = {
      defaultLevel: policy?.defaultLevel ?? 'confirm_recommended',
      overrides: policy?.overrides ?? [],
      blockedCommands: [
        ...ALWAYS_BLOCKED_COMMANDS,
        ...(policy?.blockedCommands ?? []),
      ],
      allowedCommands: policy?.allowedCommands ?? [],
    };
  }

  /**
   * Set the callback for user confirmation prompts.
   */
  setConfirmationHandler(handler: ConfirmationHandler): void {
    this.confirmationHandler = handler;
  }

  /**
   * Check the permission level for a tool.
   */
  check(toolName: string): PermissionCheck {
    // Check policy overrides first
    const override = this.policy.overrides.find((o) => o.tool === toolName);
    const level = override?.level
      ?? DEFAULT_TOOL_PERMISSIONS[toolName]
      ?? this.policy.defaultLevel;

    const requiresConfirmation = level === 'confirm_required'
      || (level === 'confirm_recommended' && this.policy.defaultLevel !== 'safe');

    return {
      toolName,
      level,
      requiresConfirmation,
      reason: this.getReasonMessage(toolName, level),
    };
  }

  /**
   * Check if a shell command is blocked.
   */
  isCommandBlocked(command: string): boolean {
    const normalized = command.toLowerCase().trim();
    return this.policy.blockedCommands.some((blocked) =>
      normalized.includes(blocked.toLowerCase()),
    );
  }

  /**
   * Check if a shell command is explicitly allowed.
   */
  isCommandAllowed(command: string): boolean {
    if (this.policy.allowedCommands.length === 0) return true; // No whitelist = all allowed
    const normalized = command.toLowerCase().trim();
    return this.policy.allowedCommands.some((allowed) =>
      normalized.startsWith(allowed.toLowerCase()),
    );
  }

  /**
   * Request confirmation from the user for a tool operation.
   * Returns true if the user approves or no handler is set.
   */
  async requestConfirmation(check: PermissionCheck): Promise<boolean> {
    if (!check.requiresConfirmation) return true;
    if (!this.confirmationHandler) return true; // No handler = auto-approve
    return this.confirmationHandler(check);
  }

  private getReasonMessage(toolName: string, level: PermissionLevel): string {
    switch (level) {
      case 'safe':
        return `${toolName} is a read-only operation.`;
      case 'confirm_recommended':
        return `${toolName} may modify your project. Confirmation recommended.`;
      case 'confirm_required':
        return `${toolName} is a destructive operation. Confirmation required.`;
    }
  }
}
