/**
 * @sentinel/core — Configuration system
 *
 * Hierarchical configuration:
 * Built-in defaults → ~/.sentinel/settings.json (global) → .sentinel/config.json (project) → SENTINEL_* env vars.
 *
 * Designed similar to Claude Code's flexible provider model:
 * - Default provider is Google AI Studio (Gemini 2.5 Flash)
 * - Settings are stored persistently in ~/.sentinel/settings.json
 * - Secrets can be loaded from settings.json or environment variables
 */

import { z } from 'zod';
import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { LogLevel, PermissionLevel } from './types.js';

// ─── Schema ──────────────────────────────────────────────────────

const PermissionOverrideSchema = z.object({
  tool: z.string(),
  level: z.enum(['safe', 'confirm_recommended', 'confirm_required']),
});

const ModelConfigSchema = z.object({
  provider: z.string().default('google'),
  model: z.string().default('gemini-2.5-flash'),
  baseUrl: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const SentinelConfigSchema = z.object({
  model: ModelConfigSchema.default({}),
  permissions: z.object({
    defaultLevel: z.enum(['safe', 'confirm_recommended', 'confirm_required']).default('confirm_recommended'),
    overrides: z.array(PermissionOverrideSchema).default([]),
    allowedCommands: z.array(z.string()).default([]),
    blockedCommands: z.array(z.string()).default([]),
  }).default({}),
  agent: z.object({
    maxIterations: z.number().int().positive().default(25),
    maxVerificationRetries: z.number().int().positive().default(3),
    streamResponses: z.boolean().default(true),
  }).default({}),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    file: z.string().optional(),
  }).default({}),
  privacy: z.object({
    sensitivePatterns: z.array(z.string()).default([
      '.env', '.env.*', '*.pem', '*.key', '*.p12',
      'credentials.*', 'service-account*.json',
      '*.secret', 'id_rsa*', 'id_ed25519*',
    ]),
  }).default({}),
});

export type SentinelConfig = z.infer<typeof SentinelConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

// ─── Settings file structure (~/.sentinel/settings.json) ──────────

export interface SettingsData {
  model: {
    provider: string;
    model: string;
    baseUrl?: string;
    apiKey?: string;
    maxTokens?: number;
    temperature?: number;
  };
  permissions?: {
    defaultLevel?: 'safe' | 'confirm_recommended' | 'confirm_required';
    overrides?: Array<{ tool: string; level: 'safe' | 'confirm_recommended' | 'confirm_required' }>;
    allowedCommands?: string[];
    blockedCommands?: string[];
  };
  agent?: {
    maxIterations?: number;
    maxVerificationRetries?: number;
    streamResponses?: boolean;
  };
  logging?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    file?: string;
  };
}

// ─── Runtime secrets ─────────────────────────────────────────────

export interface RuntimeSecrets {
  readonly apiKey: string;
}

// ─── Resolved config (config + env + overrides merged) ───────────

export interface ResolvedConfig {
  readonly config: SentinelConfig;
  readonly secrets: RuntimeSecrets;
  readonly projectRoot: string;
  readonly settingsPath: string;
}

// ─── Paths ───────────────────────────────────────────────────────

export function getGlobalSettingsDir(): string {
  return join(homedir(), '.sentinel');
}

export function getGlobalSettingsPath(): string {
  return join(getGlobalSettingsDir(), 'settings.json');
}

// ─── Defaults ────────────────────────────────────────────────────

function getDefaults(): SentinelConfig {
  return SentinelConfigSchema.parse({});
}

// ─── Settings Management (~/.sentinel/settings.json) ─────────────

/**
 * Checks if Sentinel is running for the first time without any configured settings.
 */
export async function isFirstLaunch(): Promise<boolean> {
  const settingsPath = getGlobalSettingsPath();
  try {
    const raw = await readFile(settingsPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SettingsData>;
    if (parsed.model?.apiKey && parsed.model.apiKey.trim().length > 0) {
      return false;
    }
  } catch {
    // File doesn't exist or is invalid
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

  return true;
}

/**
 * Load global user settings from ~/.sentinel/settings.json
 */
export async function loadSettings(): Promise<SettingsData | null> {
  const settingsPath = getGlobalSettingsPath();
  try {
    const raw = await readFile(settingsPath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return parsed as SettingsData;
  } catch {
    return null;
  }
}

/**
 * Save user settings to ~/.sentinel/settings.json with restricted permissions.
 */
export async function saveSettings(settings: SettingsData): Promise<void> {
  const dir = getGlobalSettingsDir();
  const filePath = getGlobalSettingsPath();

  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(filePath, JSON.stringify(settings, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

/**
 * Update user settings by partially merging new values.
 */
export async function updateSettings(partial: Partial<SettingsData>): Promise<SettingsData> {
  const existing = (await loadSettings()) ?? {
    model: {
      provider: 'google',
      model: 'gemini-2.5-flash',
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
 * Reset all user settings (deletes ~/.sentinel/settings.json).
 */
export async function resetSettings(): Promise<void> {
  const filePath = getGlobalSettingsPath();
  try {
    await rm(filePath, { force: true });
  } catch {
    // Ignore if not present
  }
}

// ─── Project Config (.sentinel/config.json) ──────────────────────

async function loadProjectConfigFile(projectRoot: string): Promise<Partial<SentinelConfig> | null> {
  const configPath = join(projectRoot, '.sentinel', 'config.json');
  try {
    const raw = await readFile(configPath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return parsed as Partial<SentinelConfig>;
  } catch {
    return null;
  }
}

// ─── Apply env vars (SENTINEL_*) ─────────────────────────────────

function applyEnvOverrides(config: SentinelConfig): SentinelConfig {
  const env = process.env;

  const model = { ...config.model };
  if (env['SENTINEL_PROVIDER']) {
    model.provider = env['SENTINEL_PROVIDER'];
  }
  if (env['SENTINEL_MODEL']) {
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

// ─── Resolve secrets ─────────────────────────────────────────────

function resolveSecrets(provider = 'google', settingsApiKey?: string): RuntimeSecrets {
  // 1. Explicit SENTINEL_API_KEY override
  let apiKey = process.env['SENTINEL_API_KEY'] ?? '';

  // 2. Provider-specific env vars
  if (!apiKey) {
    const norm = provider.toLowerCase();
    if (norm === 'google' || norm === 'gemini') {
      apiKey = process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'] ?? '';
    } else if (norm === 'anthropic' || norm === 'claude') {
      apiKey = process.env['ANTHROPIC_API_KEY'] ?? '';
    } else if (norm === 'openai') {
      apiKey = process.env['OPENAI_API_KEY'] ?? '';
    }
  }

  // 3. From saved settings.json
  if (!apiKey && settingsApiKey) {
    apiKey = settingsApiKey;
  }

  // 4. General fallback across all known env keys
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

// ─── Public API ──────────────────────────────────────────────────

/**
 * Loads the full Sentinel configuration by merging:
 * 1. Built-in defaults (provider: 'google', model: 'gemini-2.5-flash')
 * 2. ~/.sentinel/settings.json (global user settings & keys)
 * 3. .sentinel/config.json (project-specific overrides)
 * 4. System environment variables (SENTINEL_*)
 */
export async function loadConfig(projectRoot: string): Promise<ResolvedConfig> {
  const defaults = getDefaults();
  const settings = await loadSettings();
  const projectFileConfig = await loadProjectConfigFile(projectRoot);

  // Merge defaults + settings.json
  let merged: Record<string, unknown> = defaults as unknown as Record<string, unknown>;
  if (settings) {
    const { apiKey: _, ...settingsWithoutKey } = settings.model;
    const settingsClean = {
      ...settings,
      model: settingsWithoutKey,
    };
    merged = deepMerge(merged, settingsClean as Record<string, unknown>);
  }

  // Merge project-level config
  if (projectFileConfig) {
    merged = deepMerge(merged, projectFileConfig as Record<string, unknown>);
  }

  const validatedConfig = SentinelConfigSchema.parse(merged);

  // Apply environment overrides
  const config = applyEnvOverrides(validatedConfig);
  const secrets = resolveSecrets(config.model.provider, settings?.model?.apiKey);

  return {
    config,
    secrets,
    projectRoot,
    settingsPath: getGlobalSettingsPath(),
  };
}

// ─── Deep merge utility ──────────────────────────────────────────

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
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }
  return result;
}
