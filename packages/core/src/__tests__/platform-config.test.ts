import { describe, it, expect } from 'vitest';
import { PlatformService, ConfigurationResolver, SecretStore } from '../index.js';

describe('PlatformService & ConfigurationResolver', () => {
  it('should resolve standard runtime paths according to OS and home dir', () => {
    const platform = PlatformService.getInstance();
    const paths = platform.getPaths();

    expect(paths.rootDir).toBeDefined();
    expect(paths.configDir).toContain('config');
    expect(paths.dataDir).toContain('data');
    expect(paths.cacheDir).toContain('cache');
    expect(paths.logsDir).toContain('logs');
  });

  it('should detect OS info and default shell correctly', () => {
    const platform = PlatformService.getInstance();
    const osInfo = platform.getOSInfo();

    expect(osInfo.platform).toBeDefined();
    expect(osInfo.arch).toBeDefined();
    expect(osInfo.defaultShell).toBeDefined();
  });

  it('should resolve configuration with defaults and validate schema', async () => {
    const resolved = await ConfigurationResolver.resolve(process.cwd());

    expect(resolved.config).toBeDefined();
    expect(resolved.config.model.provider).toBeDefined();
    expect(resolved.config.agent.maxIterations).toBeGreaterThan(0);
    expect(resolved.config.permissions.defaultLevel).toBe('confirm_recommended');
  });

  it('should resolve secrets from environment overrides when present', () => {
    process.env['SENTINEL_API_KEY'] = 'test-secret-env';
    const secrets = SecretStore.resolveSecret('google');
    expect(secrets.apiKey).toBe('test-secret-env');
    delete process.env['SENTINEL_API_KEY'];
  });
});
