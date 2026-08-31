import { describe, it, expect } from 'vitest';
import { ProjectDetector, ProjectIdentityService } from '../index.js';

describe('ProjectDetector & ProjectIdentityService', () => {
  it('should detect the root of the current repository', async () => {
    const root = await ProjectDetector.detectRoot(process.cwd());

    expect(root.path).toBeDefined();
    expect(root.confidence).toBeGreaterThan(0.7);
    expect(root.detectionMethod).toBeDefined();
  });

  it('should resolve a stable identity for the current project', async () => {
    const identity1 = await ProjectIdentityService.resolveIdentity(process.cwd());
    const identity2 = await ProjectIdentityService.resolveIdentity(process.cwd());

    expect(identity1.id).toBe(identity2.id);
    expect(identity1.id).toMatch(/^proj_[a-f0-9]{16}$/);
    expect(identity1.name).toBeDefined();
    expect(identity1.canonicalPath).toBeDefined();
  });
});
