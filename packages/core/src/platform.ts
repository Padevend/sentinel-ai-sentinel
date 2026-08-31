/**
 * @sentinel/core — Platform and OS Abstraction
 *
 * Centralizes filesystem paths (~/sentinel/{config,data,cache,logs}),
 * OS detection, directory initialization with secure permissions,
 * and atomic crash-safe file persistence.
 */

import { homedir, platform, arch, release } from 'node:os';
import { join, dirname } from 'node:path';
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import type { SentinelPaths, PlatformType } from './types.js';

export class PlatformService {
  private static instance?: PlatformService;
  private readonly paths: SentinelPaths;

  constructor(customRootDir?: string) {
    const root = customRootDir ?? join(homedir(), 'sentinel');
    this.paths = {
      rootDir: root,
      configDir: join(root, 'config'),
      dataDir: join(root, 'data'),
      cacheDir: join(root, 'cache'),
      logsDir: join(root, 'logs'),
    };
  }

  static getInstance(): PlatformService {
    if (!PlatformService.instance) {
      PlatformService.instance = new PlatformService();
    }
    return PlatformService.instance;
  }

  /**
   * Returns the centralized Sentinel directory layout.
   */
  getPaths(): SentinelPaths {
    return this.paths;
  }

  /**
   * Detects the underlying OS platform.
   */
  getPlatform(): PlatformType {
    const p = platform();
    if (p === 'win32') return 'windows';
    if (p === 'linux') return 'linux';
    if (p === 'darwin') return 'darwin';
    return 'unknown';
  }

  /**
   * Returns detailed OS runtime diagnostic information.
   */
  getOSInfo() {
    return {
      platform: this.getPlatform(),
      rawPlatform: platform(),
      arch: arch(),
      release: release(),
      homedir: homedir(),
      defaultShell: this.getDefaultShell(),
      isWindows: platform() === 'win32',
      isPOSIX: platform() !== 'win32',
    };
  }

  /**
   * Returns the system default shell command.
   */
  getDefaultShell(): string {
    if (platform() === 'win32') {
      return process.env['COMSPEC'] ?? 'powershell.exe';
    }
    return process.env['SHELL'] ?? '/bin/sh';
  }

  /**
   * Ensures all standard runtime directories exist with restricted permissions (0o700 on POSIX).
   */
  async ensureDirectories(): Promise<void> {
    const dirs = [
      this.paths.rootDir,
      this.paths.configDir,
      this.paths.dataDir,
      this.paths.cacheDir,
      this.paths.logsDir,
      join(this.paths.dataDir, 'sessions'),
      join(this.paths.dataDir, 'projects'),
      join(this.paths.dataDir, 'state'),
    ];

    for (const dir of dirs) {
      await mkdir(dir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Writes content to a file atomically using a temporary file and atomic rename.
   * This guarantees that a sudden crash or power cut never leaves half-written corrupted files.
   */
  async atomicWriteFile(filePath: string, content: string | Buffer, mode = 0o600): Promise<void> {
    const parentDir = dirname(filePath);
    await mkdir(parentDir, { recursive: true, mode: 0o700 });

    const tempPath = `${filePath}.${randomBytes(8).toString('hex')}.tmp`;

    try {
      await writeFile(tempPath, content, {
        encoding: typeof content === 'string' ? 'utf-8' : undefined,
        mode,
      });
      await rename(tempPath, filePath);
    } catch (err) {
      // Clean up temp file on failure
      try {
        await rm(tempPath, { force: true });
      } catch {
        // Ignore cleanup error
      }
      throw err;
    }
  }
}

// ─── Convenience Exports ──────────────────────────────────────────

export function getPlatformService(): PlatformService {
  return PlatformService.getInstance();
}

export function getSentinelPaths(): SentinelPaths {
  return getPlatformService().getPaths();
}
