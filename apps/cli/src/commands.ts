/**
 * @sentinel/cli - Internal slash commands.
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
  { name: '/help', description: 'Show available slash commands and usage guide', category: 'general' },
  { name: '/model', description: 'Select or change the active model from provider discovery', category: 'config' },
  { name: '/reasoning', aliases: ['/effort', '/think'], description: 'Choose the reasoning effort for the next turns', category: 'config' },
  { name: '/status', description: 'Show project tech stack, file count and git status', category: 'project' },
  { name: '/permissions', description: 'Edit tool permission levels and safety rules', category: 'config' },
  { name: '/clear', description: 'Clear conversation history and reset memory session', category: 'session' },
  { name: '/reset', description: 'Reset configuration, close this session and return to setup', category: 'config' },
  { name: '/exit', aliases: ['/quit', '/q', '/ecit'], description: 'Exit the Sentinel interactive session', category: 'general' },
];

export function getMatchingCommands(input: string): SlashCommand[] {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed.startsWith('/')) return [];
  return SLASH_COMMANDS.filter((command) => {
    if (command.name.toLowerCase().startsWith(trimmed)) return true;
    if (command.aliases?.some((alias) => alias.toLowerCase().startsWith(trimmed))) return true;
    return trimmed.length > 2 && command.name.toLowerCase().includes(trimmed.slice(1));
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
  | { type: 'open_permissions' }
  | { type: 'open_reasoning_selector' }
  | { type: 'reset' }
  | { type: 'exit' }
  | { type: 'none' };

export function parseSlashCommand(input: string, context: CommandContext): SlashCommandAction | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  const [command] = trimmed.split(/\s+/);

  switch (command) {
    case '/help':
      return {
        type: 'message',
        message: [
          'Sentinel Slash Commands:',
          ...SLASH_COMMANDS.map((item) => `  ${item.name.padEnd(14)} - ${item.description}`),
          '',
          'Tip: use /permissions or /reasoning to open editable controls; Esc returns to chat.',
        ].join('\n'),
      };
    case '/model':
      return { type: 'open_model_selector' };
    case '/permissions':
      return { type: 'open_permissions' };
    case '/reasoning':
    case '/effort':
    case '/think':
      return { type: 'open_reasoning_selector' };
    case '/reset':
      return { type: 'reset' };
    case '/status':
      return {
        type: 'message',
        message: [
          `Project: ${context.projectInfo.name}`,
          `Stack: ${context.projectInfo.languages.join(', ')} / ${context.projectInfo.frameworks.join(', ') || 'No framework detected'}`,
          `Files: ${context.projectInfo.fileCount}`,
          `Git: ${context.projectInfo.hasGit ? 'repository detected' : 'not a git repository'}`,
          `Provider: ${context.providerName || 'not selected'}`,
          `Model: ${context.modelId || 'not selected'}`,
        ].join('\n'),
      };
    case '/clear':
      context.clearMessages();
      return { type: 'message', message: 'Session history cleared.' };
    case '/exit':
    case '/quit':
    case '/q':
    case '/ecit':
      return { type: 'exit' };
    default:
      return { type: 'message', message: `Unknown command: ${command}. Type /help for available commands.` };
  }
}

export function handleSlashCommand(input: string, context: CommandContext): string | null {
  const action = parseSlashCommand(input, context);
  if (!action) return null;
  if (action.type === 'message') return action.message;
  if (action.type === 'exit') {
    context.exitApp();
    return 'Exiting Sentinel...';
  }
  if (action.type === 'reset' && context.resetConfig) {
    void context.resetConfig();
    return 'Resetting configuration and closing session...';
  }
  return null;
}
