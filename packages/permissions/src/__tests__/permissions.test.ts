import { describe, it, expect } from 'vitest';
import { PermissionManager } from '../index.js';

describe('@sentinel/permissions', () => {
  it('should categorize safe read-only tools', () => {
    const manager = new PermissionManager();
    const check = manager.check('read_file');
    expect(check.level).toBe('safe');
    expect(check.requiresConfirmation).toBe(false);
  });

  it('should categorize destructive tools as confirm_required', () => {
    const manager = new PermissionManager();
    const check = manager.check('delete_file');
    expect(check.level).toBe('confirm_required');
    expect(check.requiresConfirmation).toBe(true);
  });

  it('should detect blocked commands in blocklist', () => {
    const manager = new PermissionManager();
    expect(manager.isCommandBlocked('rm -rf /')).toBe(true);
    expect(manager.isCommandBlocked('npm test')).toBe(false);
  });

  it('should support custom policy overrides', () => {
    const manager = new PermissionManager({
      overrides: [{ tool: 'read_file', level: 'confirm_required' }],
    });
    const check = manager.check('read_file');
    expect(check.level).toBe('confirm_required');
    expect(check.requiresConfirmation).toBe(true);
  });
});
