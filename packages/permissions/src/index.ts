/**
 * Permission policy boundary for every side-effecting Sentinel operation.
 * Unknown operations never become silently allowed.
 */

import type { PermissionLevel } from '@sentinel/core';

export type PermissionScope =
  | { readonly kind: 'shell'; readonly pattern: string }
  | { readonly kind: 'fs_write'; readonly pathGlob: string }
  | { readonly kind: 'network'; readonly hostPattern: string };

export interface PermissionRule {
  readonly scope: PermissionScope;
  readonly action: 'allow' | 'ask' | 'deny';
  readonly source: 'builtin_default' | 'global_config' | 'project_config' | 'session_override';
}

export interface PermissionRequest {
  readonly toolName: string;
  readonly scope?: PermissionScope;
  readonly input?: unknown;
}

export interface PermissionEngine {
  evaluate(request: PermissionRequest): 'allow' | 'ask' | 'deny';
  recordSessionOverride(request: PermissionRequest, decision: 'allow' | 'deny'): void;
}

export interface PermissionCheck {
  readonly toolName: string;
  readonly level: PermissionLevel;
  readonly requiresConfirmation: boolean;
  readonly reason: string;
  readonly input?: unknown;
  readonly decision: 'allow' | 'ask' | 'deny';
  readonly request: PermissionRequest;
}

export interface PermissionPolicy {
  readonly defaultLevel: PermissionLevel;
  readonly overrides: readonly PermissionOverride[];
  readonly blockedCommands: readonly string[];
  readonly allowedCommands: readonly string[];
  readonly rules: readonly PermissionRule[];
  readonly projectRoot?: string;
}

export interface PermissionOverride {
  readonly tool: string;
  readonly level: PermissionLevel;
}

export type ConfirmationHandler = (check: PermissionCheck) => Promise<boolean>;

export const BUILTIN_TOOL_PERMISSION_LEVELS: Readonly<Record<string, PermissionLevel>> = {
  read_file: 'safe',
  list_directory: 'safe',
  search_text: 'safe',
  git_status: 'safe',
  git_diff: 'safe',
  git_log: 'safe',
  git_branch: 'safe',
  detect_project: 'safe',
  write_file: 'confirm_recommended',
  patch_file: 'confirm_recommended',
  execute_command: 'confirm_recommended',
  delete_file: 'confirm_required',
};

const ALWAYS_BLOCKED_COMMANDS = [
  'rm -rf /',
  'format',
  'mkfs',
  'dd if=',
  ':(){:|:&};:',
];

export class PermissionManager implements PermissionEngine {
  private policy: PermissionPolicy;
  private readonly sessionOverrides = new Map<string, 'allow' | 'deny'>();
  private confirmationHandler: ConfirmationHandler | null = null;

  constructor(policy?: Partial<PermissionPolicy>) {
    this.policy = {
      defaultLevel: policy?.defaultLevel ?? 'confirm_recommended',
      overrides: policy?.overrides ?? [],
      blockedCommands: [...ALWAYS_BLOCKED_COMMANDS, ...(policy?.blockedCommands ?? [])],
      allowedCommands: policy?.allowedCommands ?? [],
      rules: policy?.rules ?? [],
      projectRoot: policy?.projectRoot,
    };
  }

  setConfirmationHandler(handler: ConfirmationHandler | null): void {
    this.confirmationHandler = handler;
  }

  /** Return a defensive snapshot suitable for a UI or configuration editor. */
  getPolicy(): PermissionPolicy {
    return {
      ...this.policy,
      overrides: this.policy.overrides.map((override) => ({ ...override })),
      blockedCommands: [...this.policy.blockedCommands],
      allowedCommands: [...this.policy.allowedCommands],
      rules: this.policy.rules.map((rule) => ({ ...rule, scope: { ...rule.scope } })),
    };
  }

  /** Apply editable policy fields without replacing the manager or its confirmation handler. */
  updatePolicy(update: Partial<PermissionPolicy>): void {
    this.policy = {
      ...this.policy,
      ...update,
      overrides: update.overrides ? update.overrides.map((override) => ({ ...override })) : this.policy.overrides,
      blockedCommands: update.blockedCommands ? [...update.blockedCommands] : this.policy.blockedCommands,
      allowedCommands: update.allowedCommands ? [...update.allowedCommands] : this.policy.allowedCommands,
      rules: update.rules ? update.rules.map((rule) => ({ ...rule, scope: { ...rule.scope } })) : this.policy.rules,
    };
  }

  /** Clear approvals/denials scoped to the current process after a policy edit. */
  clearSessionOverrides(): void {
    this.sessionOverrides.clear();
  }

  evaluate(request: PermissionRequest): 'allow' | 'ask' | 'deny' {
    const key = requestKey(request);
    const override = this.sessionOverrides.get(key);
    if (override) return override;

    if (request.scope?.kind === 'shell') {
      if (this.isCommandBlocked(request.scope.pattern)) return 'deny';
      if (this.isCommandAllowed(request.scope.pattern)) return 'allow';
    }

    const matchingRules = this.policy.rules.filter((rule) => scopesMatch(rule.scope, request.scope));
    if (matchingRules.some((rule) => rule.action === 'deny')) return 'deny';
    if (matchingRules.some((rule) => rule.action === 'ask')) return 'ask';
    if (matchingRules.some((rule) => rule.action === 'allow')) return 'allow';

    if (!request.scope) {
      return this.levelToDecision(this.levelForTool(request.toolName));
    }

    // A user-authored `safe` override is an explicit allow. Built-in defaults
    // remain ask-by-default for shell, network, and filesystem scopes.
    if (this.hasExplicitSafeOverride(request.toolName)) return 'allow';

    // Shell and network operations require an explicit allow or confirmation.
    // Filesystem writes are also never implicitly authorized.
    return 'ask';
  }

  recordSessionOverride(request: PermissionRequest, decision: 'allow' | 'deny'): void {
    this.sessionOverrides.set(requestKey(request), decision);
  }

  requestForTool(toolName: string, input?: unknown): PermissionRequest {
    return createPermissionRequest(toolName, input);
  }

  check(toolName: string, input?: unknown): PermissionCheck {
    const request = this.requestForTool(toolName, input);
    const level = this.levelForTool(toolName);
    const decision = this.evaluate(request);
    return {
      toolName,
      level,
      requiresConfirmation: decision === 'ask',
      reason: this.getReasonMessage(toolName, level, decision),
      input,
      decision,
      request,
    };
  }

  isCommandBlocked(command: string): boolean {
    const normalized = command.toLowerCase().trim();
    return this.policy.blockedCommands.some((blocked) => normalized.includes(blocked.toLowerCase()));
  }

  isCommandAllowed(command: string): boolean {
    if (this.policy.allowedCommands.length === 0) return false;
    const normalized = command.toLowerCase().trim();
    return this.policy.allowedCommands.some((allowed) => normalized.startsWith(allowed.toLowerCase()));
  }

  async requestConfirmation(check: PermissionCheck): Promise<boolean> {
    if (check.decision === 'deny') return false;
    if (!check.requiresConfirmation) return true;
    // No UI handler means the operation is refused, never auto-approved.
    if (!this.confirmationHandler) return false;
    return this.confirmationHandler(check);
  }

  private levelForTool(toolName: string): PermissionLevel {
    const override = this.policy.overrides.find((item) => item.tool === toolName);
    return override?.level ?? BUILTIN_TOOL_PERMISSION_LEVELS[toolName] ?? this.policy.defaultLevel;
  }

  private hasExplicitSafeOverride(toolName: string): boolean {
    return this.policy.overrides.some((override) => override.tool === toolName && override.level === 'safe');
  }

  private levelToDecision(level: PermissionLevel): 'allow' | 'ask' | 'deny' {
    if (level === 'safe') return 'allow';
    return 'ask';
  }

  private getReasonMessage(toolName: string, level: PermissionLevel, decision: 'allow' | 'ask' | 'deny'): string {
    if (decision === 'deny') return `${toolName} is denied by the active permission policy.`;
    if (decision === 'allow') return `${toolName} is allowed by the active permission policy.`;
    if (level === 'confirm_required') return `${toolName} is destructive and requires confirmation.`;
    return `${toolName} may modify the project and requires confirmation.`;
  }
}

export function createPermissionRequest(toolName: string, input?: unknown): PermissionRequest {
  if (toolName === 'execute_command') {
    const command = readString(input, 'command');
    return { toolName, input, scope: { kind: 'shell', pattern: command ?? '' } };
  }
  if (toolName === 'write_file' || toolName === 'patch_file' || toolName === 'delete_file') {
    const path = readString(input, 'path') ?? '';
    return { toolName, input, scope: { kind: 'fs_write', pathGlob: path } };
  }
  return { toolName, input };
}

function readString(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' ? candidate : undefined;
}

function requestKey(request: PermissionRequest): string {
  const scope = request.scope;
  if (!scope) return `tool:${request.toolName}`;
  return `${request.toolName}:${scope.kind}:${scope.kind === 'shell' ? scope.pattern : scope.kind === 'fs_write' ? scope.pathGlob : scope.hostPattern}`;
}

function scopesMatch(rule: PermissionScope, scope: PermissionScope | undefined): boolean {
  if (!scope || rule.kind !== scope.kind) return false;
  if (rule.kind === 'shell' && scope.kind === 'shell') return globMatch(rule.pattern, scope.pattern);
  if (rule.kind === 'fs_write' && scope.kind === 'fs_write') return globMatch(rule.pathGlob, scope.pathGlob);
  if (rule.kind === 'network' && scope.kind === 'network') return globMatch(rule.hostPattern, scope.hostPattern);
  return false;
}

function globMatch(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i').test(value);
}
