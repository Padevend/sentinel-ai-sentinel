/**
 * @sentinel/core — Doctor & Diagnostics Engine
 *
 * Provides comprehensive system diagnostic inspection and self-test functionality.
 * Does NOT depend on better-sqlite3 directly — SQLite checks are done via fs probing.
 */

import { access, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PlatformService } from './platform.js';
import { loadSettings } from './config.js';

export type CheckStatus = 'ok' | 'warning' | 'error';

export interface DiagnosticItem {
  readonly category: string;
  readonly name: string;
  readonly status: CheckStatus;
  readonly message: string;
  readonly recommendation?: string;
}

export interface DoctorReport {
  readonly timestamp: number;
  readonly version: string;
  readonly items: readonly DiagnosticItem[];
  readonly hasErrors: boolean;
  readonly hasWarnings: boolean;
}

export class DoctorEngine {
  static async diagnose(projectRoot = process.cwd()): Promise<DoctorReport> {
    const items: DiagnosticItem[] = [];
    const platform = PlatformService.getInstance();
    const paths = platform.getPaths();
    const osInfo = platform.getOSInfo();

    // 1. System & OS
    items.push({
      category: 'Environment',
      name: 'Operating System',
      status: 'ok',
      message: `${osInfo.platform} (${osInfo.arch}, release ${osInfo.release})`,
    });

    items.push({
      category: 'Environment',
      name: 'Default Shell',
      status: 'ok',
      message: osInfo.defaultShell,
    });

    items.push({
      category: 'Environment',
      name: 'Node.js',
      status: 'ok',
      message: `${process.version} (${process.arch})`,
    });

    // 2. Directories & Permissions
    try {
      await platform.ensureDirectories();
      items.push({
        category: 'Filesystem',
        name: 'Runtime Directories (~/sentinel/*)',
        status: 'ok',
        message: `Created & verified: ${paths.rootDir}`,
      });
    } catch (err) {
      items.push({
        category: 'Filesystem',
        name: 'Runtime Directories (~/sentinel/*)',
        status: 'error',
        message: `Failed to initialize runtime paths: ${err instanceof Error ? err.message : String(err)}`,
        recommendation: 'Check user permissions for home directory',
      });
    }

    // 3. Write Permissions Test
    const testFile = join(paths.cacheDir, '.doctor_write_test');
    try {
      await platform.atomicWriteFile(testFile, 'test_ok');
      await rm(testFile, { force: true });
      items.push({
        category: 'Filesystem',
        name: 'Atomic File Write & Permissions',
        status: 'ok',
        message: 'Atomic persistence functional (write, rename, delete)',
      });
    } catch (err) {
      items.push({
        category: 'Filesystem',
        name: 'Atomic File Write & Permissions',
        status: 'error',
        message: `Atomic write failed: ${err instanceof Error ? err.message : String(err)}`,
        recommendation: 'Ensure write access to ~/sentinel/cache directory',
      });
    }

    // 4. SQLite Database — probe via filesystem (no direct better-sqlite3 dependency here)
    const dbPath = join(paths.dataDir, 'sentinel.db');
    try {
      const dbStat = await stat(dbPath);
      items.push({
        category: 'Storage',
        name: 'SQLite Database',
        status: 'ok',
        message: `Found (${(dbStat.size / 1024).toFixed(1)} KB) at ${dbPath}`,
      });
    } catch {
      items.push({
        category: 'Storage',
        name: 'SQLite Database',
        status: 'warning',
        message: `Database not yet created at ${dbPath}`,
        recommendation: 'Database will be created automatically on first session',
      });
    }

    // 5. Configuration & Credentials
    try {
      const settings = await loadSettings();
      if (settings?.model?.apiKey && settings.model.apiKey.trim().length > 0) {
        items.push({
          category: 'Configuration',
          name: 'LLM Credentials',
          status: 'ok',
          message: `Configured provider: ${settings.model.provider} (model: ${settings.model.model})`,
        });
      } else if (
        process.env['SENTINEL_API_KEY'] ||
        process.env['GEMINI_API_KEY'] ||
        process.env['OPENAI_API_KEY'] ||
        process.env['ANTHROPIC_API_KEY']
      ) {
        items.push({
          category: 'Configuration',
          name: 'LLM Credentials',
          status: 'ok',
          message: 'Found active API key via environment variables',
        });
      } else {
        items.push({
          category: 'Configuration',
          name: 'LLM Credentials',
          status: 'warning',
          message: 'No API key configured in ~/sentinel/config/settings.json or environment',
          recommendation: 'Run `sentinel` to launch the Setup Wizard or set SENTINEL_API_KEY',
        });
      }
    } catch (err) {
      items.push({
        category: 'Configuration',
        name: 'Configuration Loading',
        status: 'error',
        message: `Failed to load settings: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // 6. Project Context
    try {
      await access(projectRoot);
      items.push({
        category: 'Project',
        name: 'Project Root Access',
        status: 'ok',
        message: `Accessible: ${projectRoot}`,
      });
    } catch {
      items.push({
        category: 'Project',
        name: 'Project Root Access',
        status: 'warning',
        message: `Cannot access current working directory: ${projectRoot}`,
      });
    }

    // 7. Git
    try {
      const { execSync } = await import('node:child_process');
      const gitVersion = execSync('git --version', { encoding: 'utf-8' }).trim();
      items.push({
        category: 'Environment',
        name: 'Git',
        status: 'ok',
        message: gitVersion,
      });
    } catch {
      items.push({
        category: 'Environment',
        name: 'Git',
        status: 'warning',
        message: 'Git not found in PATH',
        recommendation: 'Install Git for full project analysis capabilities',
      });
    }

    const hasErrors = items.some((i) => i.status === 'error');
    const hasWarnings = items.some((i) => i.status === 'warning');

    return {
      timestamp: Date.now(),
      version: '0.1.0',
      items,
      hasErrors,
      hasWarnings,
    };
  }

  static formatReport(report: DoctorReport): string {
    const lines: string[] = [
      `🛡️  Sentinel Diagnostics Report — v${report.version}`,
      `Date: ${new Date(report.timestamp).toLocaleString()}`,
      '',
    ];

    let currentCat = '';
    for (const item of report.items) {
      if (item.category !== currentCat) {
        currentCat = item.category;
        lines.push(`\n[${currentCat}]`);
      }

      const icon =
        item.status === 'ok'
          ? '✓ [OK]'
          : item.status === 'warning'
            ? '⚠ [WARN]'
            : '✗ [FAIL]';
      lines.push(`  ${icon.padEnd(9)} ${item.name}: ${item.message}`);
      if (item.recommendation) {
        lines.push(`            Recommendation: ${item.recommendation}`);
      }
    }

    lines.push('\n' + '─'.repeat(60));
    if (report.hasErrors) {
      lines.push('Result: Diagnostics found issues that need attention.');
    } else if (report.hasWarnings) {
      lines.push('Result: All systems operational with minor recommendations.');
    } else {
      lines.push('Result: All diagnostic checks passed successfully! Sentinel is ready.');
    }

    return lines.join('\n');
  }
}

export class SelfTestRunner {
  static async run(): Promise<{ success: boolean; output: string }> {
    const report = await DoctorEngine.diagnose();
    const formatted = DoctorEngine.formatReport(report);
    return {
      success: !report.hasErrors,
      output: formatted,
    };
  }
}
