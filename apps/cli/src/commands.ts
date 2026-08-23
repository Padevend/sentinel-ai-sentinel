/**
 * @sentinel/cli — Internal Slash Commands
 *
 * Handles control commands like /help, /status, /model, /permissions, /clear, /reset, /exit
 */

import type { ProjectInfo } from '@sentinel/core';

export interface SlashCommand {
  name: string;
  aliases?: string[];
  description: string;
  category: 'general' | 'project' | 'session' | 'config';
  syntax?: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: '/help',
    description: 'Show available slash commands and usage guide',
    category: 'general',
  },
  {
    name: '/model',
    description: 'Select or change active LLM model for current provider',
    category: 'config',
  },
  {
    name: '/status',
    description: 'Show project tech stack, file count & git status',
    category: 'project',
  },
  {
    name: '/permissions',
    description: 'Show active tool permission levels & safety rules',
    category: 'config',
  },
  {
    name: '/clear',
    description: 'Clear conversation history and reset memory session',
    category: 'session',
  },
  {
    name: '/reset',
    description: 'Reset all configuration to default and wipe settings.json',
    category: 'config',
  },
  {
    name: '/exit',
    aliases: ['/quit'],
    description: 'Exit the Sentinel interactive session',
    category: 'general',
  },
];

export function getMatchingCommands(input: string): SlashCommand[] {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed.startsWith('/')) return [];

  return SLASH_COMMANDS.filter((cmd) => {
    if (cmd.name.toLowerCase().startsWith(trimmed)) return true;
    if (cmd.aliases?.some((a) => a.toLowerCase().startsWith(trimmed))) return true;
    if (trimmed.length > 2 && cmd.name.toLowerCase().includes(trimmed.slice(1))) return true;
    return false;
  });
}

export interface CommandContext {
  projectInfo: ProjectInfo;
  modelId: string;
  providerName: string;
  clearMessages: () => void;
  exitApp: () => void;
  openModelSelector?: () => void;
  resetConfig?: () => Promise<void>;
}

export type SlashCommandAction =
  | { type: 'message'; message: string }
  | { type: 'open_model_selector' }
  | { type: 'reset' }
  | { type: 'none' };

export function parseSlashCommand(input: string, context: CommandContext): SlashCommandAction | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const [cmd] = trimmed.split(' ');

  switch (cmd) {
    case '/help':
      return {
        type: 'message',
        message: [
          'Sentinel Slash Commands:',
          ...SLASH_COMMANDS.map((c) => `  ${c.name.padEnd(14)} - ${c.description}`),
        ].join('\n'),
      };

    case '/model':
      return { type: 'open_model_selector' };

    case '/reset':
      return { type: 'reset' };

    case '/status':
      return {
        type: 'message',
        message: [
          `Project: ${context.projectInfo.name}`,
          `Stack: ${context.projectInfo.languages.join(', ')} / ${context.projectInfo.frameworks.join(', ') || 'No framework detected'}`,
          `Files: ${context.projectInfo.fileCount}`,
          `Git: ${context.projectInfo.hasGit ? '✓ repository detected' : '✗ not a git repository'}`,
        ].join('\n'),
      };

    case '/permissions':
      return {
        type: 'message',
        message: [
          'Tool Permission Rules & Safety:',
          '  • Safe (Auto-approved): read_file, list_directory, search_text, git_status, git_log, git_diff',
          '  • Confirm Recommended: write_file, patch_file, execute_command',
          '  • Confirm Required: delete_file, git_commit, git_push',
        ].join('\n'),
      };

    case '/clear':
      context.clearMessages();
      return { type: 'message', message: 'Session history cleared.' };

    case '/exit':
    case '/quit':
      context.exitApp();
      return { type: 'message', message: 'Exiting Sentinel...' };

    default:
      return {
        type: 'message',
        message: `Unknown command: ${cmd}. Type /help for available commands.`,
      };
  }
}

export function handleSlashCommand(input: string, context: CommandContext): string | null {
  const action = parseSlashCommand(input, context);
  if (!action) return null;
  if (action.type === 'message') return action.message;
  return null;
}
