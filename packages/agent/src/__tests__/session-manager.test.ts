import { describe, it, expect, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQLiteRepositories } from '@sentinel/storage';
import { SessionManager, AgentSession } from '../index.js';
import type { ProjectId } from '@sentinel/core';

describe('SessionManager & Recovery', () => {
  const testDbPath = join(tmpdir(), `sentinel-agent-test-${Date.now()}.db`);
  const repos = new SQLiteRepositories(testDbPath);
  const manager = new SessionManager(repos.sessions);

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

  it('should create and persist a new session', async () => {
    const session = await manager.createSession({
      projectId: 'proj_unit_test' as ProjectId,
      modelId: 'test-model',
      providerName: 'Google AI',
    });

    expect(session.id).toBeDefined();
    expect(session.status).toBe('active');

    const retrieved = await manager.loadSession(session.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(session.id);
  });

  it('should create checkpoints and reconstruct context', async () => {
    const session = new AgentSession({
      projectId: 'proj_unit_test' as ProjectId,
      modelId: 'test-model',
      providerName: 'Google AI',
    });

    session.setTaskSummary('Fix null pointer exception');
    session.recordModifiedFile('src/auth.ts');
    session.updateState({
      completedSteps: ['Analyzed stack trace', 'Added null check'],
      pendingSteps: ['Run tests'],
    });
    session.createCheckpoint('Step 2: added null check in auth.ts');

    await manager.saveSession(session);

    const loaded = await manager.loadSession(session.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.getModifiedFiles()).toContain('src/auth.ts');
    expect(loaded?.getCheckpoints().length).toBe(1);

    const reconstructed = manager.reconstructContext(loaded!);
    expect(reconstructed).toContain('Fix null pointer exception');
    expect(reconstructed).toContain('Analyzed stack trace');
    expect(reconstructed).toContain('src/auth.ts');
  });
});
