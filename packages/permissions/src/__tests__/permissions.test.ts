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

  it('should apply editable policy changes at runtime', () => {
    const manager = new PermissionManager();
    manager.updatePolicy({
      defaultLevel: 'confirm_required',
      overrides: [{ tool: 'read_file', level: 'confirm_recommended' }],
    });
    expect(manager.getPolicy().defaultLevel).toBe('confirm_required');
    expect(manager.check('read_file').requiresConfirmation).toBe(true);
    expect(manager.check('unknown_tool').level).toBe('confirm_required');
  });

  it('treats an explicit safe override as an allow while retaining blocklist denial', () => {
    const manager = new PermissionManager({ overrides: [{ tool: 'write_file', level: 'safe' }] });
    expect(manager.evaluate(manager.requestForTool('write_file', { path: 'src/index.ts' }))).toBe('allow');
    expect(manager.evaluate(manager.requestForTool('execute_command', { command: 'rm -rf /' }))).toBe('deny');
  });
  it("should deny a sensitive action when the confirmation handler rejects", async () => {
    const manager = new PermissionManager();
    manager.setConfirmationHandler(async () => false);
    expect(await manager.requestConfirmation(manager.check("write_file"))).toBe(false);
  });

  it("should enforce command blocklist and whitelist decisions", () => {
    const manager = new PermissionManager({ allowedCommands: ["npm test"] });
    expect(manager.isCommandAllowed("npm test -- --run")).toBe(true);
    expect(manager.isCommandAllowed("npm install")).toBe(false);
    expect(manager.isCommandBlocked("rm -rf /")).toBe(true);
  });

  it('asks by default for shell commands and denies blocked commands', () => {
    const manager = new PermissionManager();
    expect(manager.evaluate(manager.requestForTool('execute_command', { command: 'npm test' }))).toBe('ask');
    expect(manager.evaluate(manager.requestForTool('execute_command', { command: 'rm -rf /' }))).toBe('deny');
    manager.recordSessionOverride(manager.requestForTool('execute_command', { command: 'npm test' }), 'allow');
    expect(manager.evaluate(manager.requestForTool('execute_command', { command: 'npm test' }))).toBe('allow');
  });
});
