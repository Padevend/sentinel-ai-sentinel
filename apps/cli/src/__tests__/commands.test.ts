import { describe, it, expect, vi } from 'vitest';
import { getMatchingCommands, handleSlashCommand, SLASH_COMMANDS } from '../commands.js';
import type { ProjectInfo } from '@sentinel/core';

describe('Slash Commands & Autocompletion', () => {
  it('should match all slash commands when typing "/"', () => {
    const matches = getMatchingCommands('/');
    expect(matches.length).toBe(SLASH_COMMANDS.length);
  });

  it('should filter commands by prefix', () => {
    const matches = getMatchingCommands('/stat');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.name).toBe('/status');
  });

  it('should match alias commands like /quit', () => {
    const matches = getMatchingCommands('/qui');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.name).toBe('/exit');
  });

  it('should execute slash commands properly', () => {
    const mockExit = vi.fn();
    const mockClear = vi.fn();
    const mockProjectInfo: ProjectInfo = {
      name: 'test-app',
      rootPath: '/test' as any,
      languages: ['TypeScript'],
      frameworks: ['React'],
      packageManager: 'pnpm',
      testFramework: 'vitest',
      scripts: {},
      hasGit: true,
      fileCount: 42,
    };

    const statusResult = handleSlashCommand('/status', {
      projectInfo: mockProjectInfo,
      modelId: 'gpt-4o',
      providerName: 'OpenAI',
      clearMessages: mockClear,
      exitApp: mockExit,
    });
    expect(statusResult).toContain('Project: test-app');
    expect(statusResult).toContain('Stack: TypeScript / React');

    const helpResult = handleSlashCommand('/help', {
      projectInfo: mockProjectInfo,
      modelId: 'gpt-4o',
      providerName: 'OpenAI',
      clearMessages: mockClear,
      exitApp: mockExit,
    });
    expect(helpResult).toContain('/status');
    expect(helpResult).toContain('/model');

    const clearResult = handleSlashCommand('/clear', {
      projectInfo: mockProjectInfo,
      modelId: 'gpt-4o',
      providerName: 'OpenAI',
      clearMessages: mockClear,
      exitApp: mockExit,
    });
    expect(mockClear).toHaveBeenCalled();
    expect(clearResult).toContain('cleared');
  });
});
