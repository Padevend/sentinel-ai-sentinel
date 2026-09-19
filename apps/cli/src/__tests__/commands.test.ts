import { describe, it, expect, vi } from 'vitest';
import { getMatchingCommands, handleSlashCommand, parseSlashCommand, SLASH_COMMANDS } from '../commands.js';
import type { AbsolutePath, ProjectInfo } from '@sentinel/core';

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

  it('should recognize the common /ecit typo as an exit alias', () => {
    const matches = getMatchingCommands('/eci');
    expect(matches[0]?.name).toBe('/exit');
  });

  it('should execute slash commands properly', () => {
    const mockExit = vi.fn();
    const mockClear = vi.fn();
    const mockProjectInfo: ProjectInfo = {
      name: 'test-app',
      rootPath: '/test' as AbsolutePath,
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
      modelId: 'test-model',
      providerName: 'OpenAI',
      clearMessages: mockClear,
      exitApp: mockExit,
    });
    expect(statusResult).toContain('Project: test-app');
    expect(statusResult).toContain('Stack: TypeScript / React');

    const helpResult = handleSlashCommand('/help', {
      projectInfo: mockProjectInfo,
      modelId: 'test-model',
      providerName: 'OpenAI',
      clearMessages: mockClear,
      exitApp: mockExit,
    });
    expect(helpResult).toContain('/status');
    expect(helpResult).toContain('/model');

    const clearResult = handleSlashCommand('/clear', {
      projectInfo: mockProjectInfo,
      modelId: 'test-model',
      providerName: 'OpenAI',
      clearMessages: mockClear,
      exitApp: mockExit,
    });
    expect(mockClear).toHaveBeenCalled();
    expect(clearResult).toContain('cleared');
  });

  it('opens editable permissions and reasoning modes', () => {
    const context = {
      projectInfo: {
        name: 'test-app',
        rootPath: '/test' as AbsolutePath,
        languages: [],
        frameworks: [],
        packageManager: 'pnpm' as const,
        testFramework: 'vitest' as const,
        scripts: {},
        hasGit: true,
        fileCount: 0,
      },
      modelId: 'test-model',
      providerName: 'OpenAI',
      clearMessages: vi.fn(),
      exitApp: vi.fn(),
    };
    expect(parseSlashCommand('/permissions', context)).toEqual({ type: 'open_permissions' });
    expect(parseSlashCommand('/effort', context)).toEqual({ type: 'open_reasoning_selector' });
  });

  it('closes the app for /ecit through the compatibility handler', () => {
    const exit = vi.fn();
    const projectInfo: ProjectInfo = {
      name: 'test-app',
      rootPath: '/test' as AbsolutePath,
      languages: [],
      frameworks: [],
      packageManager: 'pnpm',
      testFramework: 'vitest',
      scripts: {},
      hasGit: true,
      fileCount: 0,
    };
    expect(handleSlashCommand('/ecit', {
      projectInfo,
      modelId: 'test-model',
      providerName: 'OpenAI',
      clearMessages: vi.fn(),
      exitApp: exit,
    })).toContain('Exiting');
    expect(exit).toHaveBeenCalledOnce();
  });

  it('delegates /reset to the reset callback for non-Ink callers', async () => {
    const reset = vi.fn(async () => undefined);
    const projectInfo: ProjectInfo = {
      name: 'test-app',
      rootPath: '/test' as AbsolutePath,
      languages: [],
      frameworks: [],
      packageManager: 'pnpm',
      testFramework: 'vitest',
      scripts: {},
      hasGit: true,
      fileCount: 0,
    };
    const result = handleSlashCommand('/reset', {
      projectInfo,
      modelId: 'test-model',
      providerName: 'OpenAI',
      clearMessages: vi.fn(),
      exitApp: vi.fn(),
      resetConfig: reset,
    });
    expect(result).toContain('Resetting');
    expect(reset).toHaveBeenCalledOnce();
    await reset.mock.results[0]?.value;
  });
});
