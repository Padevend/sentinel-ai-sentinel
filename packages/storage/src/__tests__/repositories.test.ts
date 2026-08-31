import { describe, it, expect, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQLiteRepositories } from '../index.js';
import type { ProjectIdentity, StoredSession } from '@sentinel/core';

describe('SQLiteRepositories & Migrations', () => {
  const testDbPath = join(tmpdir(), `sentinel-test-${Date.now()}.db`);
  const repos = new SQLiteRepositories(testDbPath);

  afterAll(() => {
    repos.close();
    try {
      rmSync(testDbPath, { force: true });
      rmSync(`${testDbPath}-wal`, { force: true });
      rmSync(`${testDbPath}-shm`, { force: true });
    } catch {
      // Ignore
    }
  });

  it('should persist and retrieve project identity', async () => {
    const project: ProjectIdentity = {
      id: 'proj_test_123' as any,
      name: 'test-project',
      canonicalPath: '/test/path',
      gitRemote: 'https://github.com/org/repo',
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    };

    await repos.projects.save(project);
    const retrieved = await repos.projects.findById(project.id);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(project.id);
    expect(retrieved?.name).toBe('test-project');
    expect(retrieved?.gitRemote).toBe('https://github.com/org/repo');
  });

  it('should persist, query, and delete sessions with checkpoints', async () => {
    const session: StoredSession = {
      id: 'sess_test_1' as any,
      projectId: 'proj_test_123' as any,
      workspaceId: 'ws_test_1' as any,
      status: 'active',
      createdAt: Date.now() - 1000,
      updatedAt: Date.now(),
      taskSummary: 'Test session task',
      modelId: 'gemini-3.1-pro',
      providerName: 'Google AI',
      messages: [{ role: 'user', content: 'Hello', timestamp: new Date() }],
      state: { completedSteps: ['step 1'], pendingSteps: [], verificationStatus: 'passing' },
      checkpoints: [
        {
          id: 'chk_1',
          sessionId: 'sess_test_1' as any,
          stepIndex: 1,
          summary: 'Step 1 complete',
          state: { completedSteps: ['step 1'], pendingSteps: [], verificationStatus: 'passing' },
          filesModified: ['src/main.ts'],
          timestamp: Date.now(),
        },
      ],
      filesModified: ['src/main.ts'],
      totalUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    };

    await repos.sessions.save(session);
    const retrieved = await repos.sessions.findById(session.id);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(session.id);
    expect(retrieved?.status).toBe('active');
    expect(retrieved?.filesModified).toContain('src/main.ts');
    expect(retrieved?.checkpoints.length).toBe(1);

    const summaries = await repos.sessions.listForProject(session.projectId);
    expect(summaries.length).toBe(1);
    expect(summaries[0]?.id).toBe(session.id);
    expect(summaries[0]?.taskSummary).toBe('Test session task');

    const deleted = await repos.sessions.delete(session.id);
    expect(deleted).toBe(true);

    const afterDelete = await repos.sessions.findById(session.id);
    expect(afterDelete).toBeNull();
  });
});
