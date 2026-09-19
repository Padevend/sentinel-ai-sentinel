/**
 * @sentinel/core — Configuration System
 *
 * Implements strict hierarchical configuration resolution:
 * Built-in defaults → ~/sentinel/config/settings.json (global) → <project>/.sentinel/settings.json (project) → Session / CLI overrides.
 *
 * Secrets are securely isolated in the global settings or environment variables,
 * and are never persisted in project repository folders.
 */

import { z } from 'zod';
import { readFile, rm, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, hostname } from 'node:os';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { PlatformService } from './platform.js';
import { ConfigurationError } from './errors.js';
import type { LogLevel, PermissionLevel } from './types.js';

// ─── Schemas ─────────────────────────────────────────────────────

export const PermissionOverrideSchema = z.object({
  tool: z.string(),
  level: z.enum(['safe', 'confirm_recommended', 'confirm_required']),
});

export const PermissionRuleSchema = z.object({
  scope: z.union([
    z.object({ kind: z.literal('shell'), pattern: z.string() }),
    z.object({ kind: z.literal('fs_write'), pathGlob: z.string() }),
    z.object({ kind: z.literal('network'), hostPattern: z.string() }),
  ]),
  action: z.enum(['allow', 'ask', 'deny']),
  source: z.enum(['builtin_default', 'global_config', 'project_config', 'session_override']),
});

export const ModelConfigSchema = z.object({
  provider: z.string().trim().min(1).default('google'),
  /** Legacy alias retained for migration; discovery populates modelId. */
  model: z.string().trim().min(1).optional(),
  modelId: z.string().trim().min(1).optional(),
  reasoningEffort: z.enum(['low', 'medium', 'high', 'max']).optional(),
  baseUrl: z.string().trim().url().optional(),
  apiKey: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export const PermissionsConfigSchema = z.object({
  defaultLevel: z.enum(['safe', 'confirm_recommended', 'confirm_required']).default('confirm_recommended'),
  overrides: z.array(PermissionOverrideSchema).default([]),
  rules: z.array(PermissionRuleSchema).default([]),
  allowedCommands: z.array(z.string()).default([]),
  blockedCommands: z.array(z.string()).default([]),
});

export const AgentConfigSchema = z.object({
  maxIterations: z.number().int().positive().default(25),
  maxVerificationRetries: z.number().int().positive().default(3),
  streamResponses: z.boolean().default(true),
});

export const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  file: z.string().optional(),
});

export const PrivacyConfigSchema = z.object({
  sensitivePatterns: z.array(z.string()).default([
    '.env', '.env.*', '*.pem', '*.key', '*.p12',
    'credentials.*', 'service-account*.json',
    '*.secret', 'id_rsa*', 'id_ed25519*',
  ]),
});
export const McpServerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  transport: z.enum(["stdio"]).default("stdio"),
  command: z.string().trim().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  startupTimeoutMs: z.number().int().positive().max(120000).default(15000),
});

export const McpConfigSchema = z.object({
  servers: z.record(McpServerConfigSchema).default({}),
});

export const SkillsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  directories: z.array(z.string().trim().min(1)).default([".sentinel/skills"]),
  enabledSkills: z.array(z.string().trim().min(1)).default([]),
});

export const SentinelConfigSchema = z.object({
  version: z.number().int().default(1),
  model: ModelConfigSchema.default({}),
  permissions: PermissionsConfigSchema.default({}),
  agent: AgentConfigSchema.default({}),
  logging: LoggingConfigSchema.default({}),
  privacy: PrivacyConfigSchema.default({}),
  mcp: McpConfigSchema.default({}),
  skills: SkillsConfigSchema.default({}),
});

export type SentinelConfig = z.infer<typeof SentinelConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export type McpConfig = z.infer<typeof McpConfigSchema>;
export type SkillsConfig = z.infer<typeof SkillsConfigSchema>;

export interface SettingsData {
  version?: number;
  model: {
    provider: string;
    model?: string;
    modelId?: string;
    reasoningEffort?: 'low' | 'medium' | 'high' | 'max';
    baseUrl?: string;
    apiKey?: string;
    maxTokens?: number;
    temperature?: number;
  };
  permissions?: {
    defaultLevel?: 'safe' | 'confirm_recommended' | 'confirm_required';
    overrides?: Array<{ tool: string; level: 'safe' | 'confirm_recommended' | 'confirm_required' }>;
    rules?: Array<{
      scope: { kind: 'shell'; pattern: string } | { kind: 'fs_write'; pathGlob: string } | { kind: 'network'; hostPattern: string };
      action: 'allow' | 'ask' | 'deny';
      source: 'builtin_default' | 'global_config' | 'project_config' | 'session_override';
    }>;
    allowedCommands?: string[];
    blockedCommands?: string[];
  };
  agent?: {
    maxIterations?: number;
    maxVerificationRetries?: number;
    streamResponses?: boolean;
  };
  mcp?: {
    servers?: Record<string, {
      enabled?: boolean;
      transport?: 'stdio';
      command: string;
      args?: string[];
      env?: Record<string, string>;
      startupTimeoutMs?: number;
    }>;
  };
  skills?: {
    enabled?: boolean;
    directories?: string[];
    enabledSkills?: string[];
  };
  logging?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    file?: string;
  };
}

// ─── Runtime Secrets (never serialized in project config) ─────────

export interface RuntimeSecrets {
  readonly apiKey: string;
}

// ─── Resolved Configuration (Immutable Object) ───────────────────

export interface ResolvedConfig {
  readonly config: SentinelConfig;
  readonly secrets: RuntimeSecrets;
  readonly projectRoot: string;
  readonly globalConfigPath: string;
  readonly projectConfigPath?: string;
}

// ─── Path Helpers ────────────────────────────────────────────────

export function getGlobalConfigDir(): string {
  return PlatformService.getInstance().getPaths().configDir;
}

export function getGlobalSettingsPath(): string {
  return join(getGlobalConfigDir(), 'settings.json');
}

function getGlobalSecretsPath(): string {
  return join(getGlobalConfigDir(), 'secrets.json');
}

/**
 * Returns legacy ~/.sentinel/settings.json path if it exists for migration.
 */
function getLegacySettingsPath(): string {
  return join(homedir(), '.sentinel', 'settings.json');
}

// ─── Settings Management ─────────────────────────────────────────

/**
 * Checks if Sentinel is running for the first time without any configured settings or credentials.
 */
export async function isFirstLaunch(): Promise<boolean> {
  const settings = await loadSettings();
  if (settings?.model?.apiKey && settings.model.apiKey.trim().length > 0) {
    return false;
  }

  // Check if an API key is available via environment variables
  if (
    process.env['SENTINEL_API_KEY'] ||
    process.env['GEMINI_API_KEY'] ||
    process.env['GOOGLE_API_KEY'] ||
    process.env['OPENAI_API_KEY'] ||
    process.env['ANTHROPIC_API_KEY']
  ) {
    return false;
  }

  if (SecretStore.resolveSecret(settings?.model?.provider ?? 'google').apiKey) return false;

  const provider = settings?.model?.provider?.toLowerCase();
  const hasModelForKeylessProvider = Boolean(settings?.model?.modelId ?? settings?.model?.model)
    && (provider === 'ollama' || provider === 'custom');
  if (hasModelForKeylessProvider) return false;

  return true;
}

/**
 * Load global user settings from ~/sentinel/config/settings.json (with migration support).
 */
export async function loadSettings(): Promise<SettingsData | null> {
  const primaryPath = getGlobalSettingsPath();
  const legacyPath = getLegacySettingsPath();

  // Try primary standard path first
  try {
    const raw = await readFile(primaryPath, 'utf-8');
    const parsed = JSON.parse(raw) as SettingsData;
    if (parsed.model?.apiKey) {
      await saveSettings(parsed);
      return { ...parsed, model: { ...parsed.model, apiKey: undefined } };
    }
    return parsed;
  } catch {
    // Try legacy path
    try {
      const rawLegacy = await readFile(legacyPath, 'utf-8');
      const parsed = JSON.parse(rawLegacy) as SettingsData;
      // Auto-migrate to standard path
      await saveSettings(parsed);
      return { ...parsed, model: { ...parsed.model, apiKey: undefined } };
    } catch {
      return null;
    }
  }
}

/**
 * Save user settings to ~/sentinel/config/settings.json using atomic crash-safe writes.
 */
export async function saveSettings(settings: SettingsData): Promise<void> {
  const platformService = PlatformService.getInstance();
  await platformService.ensureDirectories();
  const primaryPath = getGlobalSettingsPath();

  const apiKey = settings.model.apiKey;
  if (apiKey) await SecretStore.saveSecret(settings.model.provider, apiKey);
  const safeSettings: SettingsData = {
    ...settings,
    model: { ...settings.model, apiKey: undefined },
  };
  const formatted = JSON.stringify(safeSettings, null, 2);
  await platformService.atomicWriteFile(primaryPath, formatted, 0o600);
}

/**
 * Update user settings by partially merging new values.
 */
export async function updateSettings(partial: Partial<SettingsData>): Promise<SettingsData> {
  const existing = (await loadSettings()) ?? {
    model: {
      provider: 'google',
    },
  };

  const updated = deepMerge(
    existing as unknown as Record<string, unknown>,
    partial as unknown as Record<string, unknown>,
  ) as unknown as SettingsData;

  await saveSettings(updated);
  return updated;
}

/**
 * Reset all user settings (deletes settings.json).
 */
export async function resetSettings(): Promise<void> {
  const primaryPath = getGlobalSettingsPath();
  const legacyPath = getLegacySettingsPath();

  try {
    await rm(primaryPath, { force: true });
  } catch {
    // Ignore
  }
  try {
    await rm(legacyPath, { force: true });
  } catch {
    // Ignore
  }
  try {
    await rm(getGlobalSecretsPath(), { force: true });
  } catch {
    // Ignore
  }
}

// ─── Project Config (<projectRoot>/.sentinel/settings.json) ───────

async function loadProjectConfigFile(projectRoot: string): Promise<{
  data: Partial<SentinelConfig> | null;
  path?: string;
}> {
  const candidates = [
    join(projectRoot, '.sentinel', 'settings.json'),
    join(projectRoot, '.sentinel', 'config.json'),
  ];

  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, "utf-8");
      const parsed = JSON.parse(raw) as Partial<SentinelConfig>;
      if (parsed.model && typeof parsed.model === "object") {
        const model = { ...parsed.model };
        delete model.apiKey;
        return { data: { ...parsed, model }, path: candidate };
      }
      return { data: parsed, path: candidate };
    } catch {
      // Continue to next candidate
    }
  }

  return { data: null };
}

// ─── Environment Overrides (SENTINEL_*) ───────────────────────────

function applyEnvOverrides(config: SentinelConfig): SentinelConfig {
  const env = process.env;

  const model = { ...config.model };
  if (env['SENTINEL_PROVIDER']) {
    model.provider = env['SENTINEL_PROVIDER'];
  }
  if (env['SENTINEL_MODEL']) {
    model.modelId = env['SENTINEL_MODEL'];
    model.model = env['SENTINEL_MODEL'];
  }
  if (env['SENTINEL_BASE_URL']) {
    model.baseUrl = env['SENTINEL_BASE_URL'];
  }

  const agent = { ...config.agent };
  if (env['SENTINEL_MAX_ITERATIONS']) {
    const val = parseInt(env['SENTINEL_MAX_ITERATIONS'], 10);
    if (!isNaN(val) && val > 0) {
      agent.maxIterations = val;
    }
  }

  const logging = { ...config.logging };
  if (env['SENTINEL_LOG_LEVEL']) {
    const level = env['SENTINEL_LOG_LEVEL'] as LogLevel;
    if (['debug', 'info', 'warn', 'error'].includes(level)) {
      logging.level = level;
    }
  }

  return { ...config, model, agent, logging };
}

// ─── Secret Resolution ───────────────────────────────────────────

export class SecretStore {
  static resolveSecret(provider = 'google', settingsApiKey?: string): RuntimeSecrets {
    // 1. Explicit SENTINEL_API_KEY override
    let apiKey = process.env['SENTINEL_API_KEY'] ?? '';

    // 2. Provider-specific environment variable
    if (!apiKey) {
      const norm = provider.toLowerCase();
      if (norm.includes('google') || norm.includes('gemini')) {
        apiKey = process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'] ?? '';
      } else if (norm.includes('anthropic') || norm.includes('claude')) {
        apiKey = process.env['ANTHROPIC_API_KEY'] ?? '';
      } else if (norm.includes('openai')) {
        apiKey = process.env['OPENAI_API_KEY'] ?? '';
      }
    }

    // 3. From global settings.json
    if (!apiKey && settingsApiKey) {
      apiKey = settingsApiKey;
    }

    if (!apiKey) apiKey = this.readSecret(provider);

    // 4. Fallback across all common API keys
    if (!apiKey) {
      apiKey =
        process.env['GEMINI_API_KEY'] ??
        process.env['GOOGLE_API_KEY'] ??
        process.env['OPENAI_API_KEY'] ??
        process.env['ANTHROPIC_API_KEY'] ??
        '';
    }

    return { apiKey };
  }

  static async saveSecret(provider: string, apiKey: string): Promise<void> {
    if (!apiKey) return;
    const platformService = PlatformService.getInstance();
    await platformService.ensureDirectories();
    const current = this.readSecretFile();
    current[provider.toLowerCase()] = this.encrypt(apiKey);
    await platformService.atomicWriteFile(getGlobalSecretsPath(), JSON.stringify({ version: 1, entries: current }, null, 2), 0o600);
  }

  private static readSecret(provider: string): string {
    const entry = this.readSecretFile()[provider.toLowerCase()] ?? this.readSecretFile()['sentinel'];
    if (!entry) return '';
    try { return this.decrypt(entry); } catch { return ''; }
  }

  private static readSecretFile(): Record<string, EncryptedSecret> {
    try {
      const parsed = JSON.parse(readFileSync(getGlobalSecretsPath(), 'utf8')) as { entries?: Record<string, EncryptedSecret> };
      return parsed.entries ?? {};
    } catch {
      return {};
    }
  }

  private static encrypt(value: string): EncryptedSecret {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  }

  private static decrypt(value: EncryptedSecret): string {
    const decipher = createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(value.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }
}

interface EncryptedSecret {
  readonly iv: string;
  readonly tag: string;
  readonly ciphertext: string;
}

function secretKey(): Buffer {
  return createHash('sha256').update(`${homedir()}:${hostname()}:sentinel-secrets`).digest();
}

// ─── Configuration Resolver ──────────────────────────────────────

export class ConfigurationResolver {
  /**
   * Resolves the full Sentinel configuration hierarchy:
   * Defaults → Global (~/sentinel/config/settings.json) → Project (.sentinel/settings.json) → Environment overrides.
   */
  static async resolve(projectRoot: string): Promise<ResolvedConfig> {
    const defaults = SentinelConfigSchema.parse({});
    const globalSettings = await loadSettings();
    const projectConfigResult = await loadProjectConfigFile(projectRoot);

    let merged: Record<string, unknown> = defaults as unknown as Record<string, unknown>;

    // Merge global settings
    if (globalSettings) {
      const { apiKey: _, ...cleanModel } = globalSettings.model;
      const cleanGlobal = {
        ...globalSettings,
        model: cleanModel,
      };
      merged = deepMerge(merged, cleanGlobal as Record<string, unknown>);
    }

    // Merge project settings
    if (projectConfigResult.data) {
      merged = deepMerge(merged, projectConfigResult.data as Record<string, unknown>);
    }

    // Validate merged schema with descriptive errors
    const parseResult = SentinelConfigSchema.safeParse(merged);
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
        .join('\n');
      throw new ConfigurationError(`Invalid configuration detected:\n${issues}`, {
        code: 'INVALID_CONFIG_SCHEMA',
      });
    }

    // Apply environment overrides (highest precedence)
    const finalConfig = applyEnvOverrides(parseResult.data);
    if (!finalConfig.model.modelId && finalConfig.model.model) {
      finalConfig.model.modelId = finalConfig.model.model;
    }
    const secrets = SecretStore.resolveSecret(
      finalConfig.model.provider,
      globalSettings?.model?.apiKey,
    );

    return {
      config: finalConfig,
      secrets,
      projectRoot,
      globalConfigPath: getGlobalSettingsPath(),
      projectConfigPath: projectConfigResult.path,
    };
  }
}

// ─── Public API ──────────────────────────────────────────────────

export async function loadConfig(projectRoot: string): Promise<ResolvedConfig> {
  return ConfigurationResolver.resolve(projectRoot);
}

// ─── Deep Merge Utility ──────────────────────────────────────────

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        (targetVal ?? {}) as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }
  return result;
}
