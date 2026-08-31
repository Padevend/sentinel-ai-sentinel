/**
 * @sentinel/project — Project Identity Service
 *
 * Generates and resolves unique, stable identities for projects.
 * Stable across directory relocations when git remote is present,
 * and falls back cleanly to deterministic filesystem hashing when Git is unavailable.
 */

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { realpath, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { GitClient } from '@sentinel/git';
import type { ProjectIdentity, ProjectId } from '@sentinel/core';

export class ProjectIdentityService {
  /**
   * Resolves the identity of a project from its root path.
   */
  static async resolveIdentity(projectRoot: string): Promise<ProjectIdentity> {
    let canonicalPath: string;
    try {
      canonicalPath = await realpath(projectRoot);
    } catch {
      canonicalPath = projectRoot;
    }

    // Try reading project name from package.json or folder name
    let projectName = basename(canonicalPath);
    try {
      const pkgRaw = await readFile(join(canonicalPath, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgRaw) as { name?: string };
      if (pkg.name) projectName = pkg.name;
    } catch {
      // Keep folder name
    }

    // Check for git repository and remote
    const git = new GitClient(canonicalPath);
    let gitRemote: string | undefined;

    if (await git.isRepository()) {
      try {
        const remoteUrl = execSync('git remote get-url origin', {
          cwd: canonicalPath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        if (remoteUrl) {
          gitRemote = remoteUrl;
        }
      } catch {
        // Git remote not configured — not an error
      }
    }

    // Generate stable ID
    const id = this.computeProjectId(canonicalPath, gitRemote, projectName);
    const now = Date.now();

    let createdAt = now;
    try {
      const rootStat = await stat(canonicalPath);
      createdAt = Math.floor(rootStat.birthtimeMs || rootStat.mtimeMs || now);
    } catch {
      // Default to now
    }

    return {
      id: id as ProjectId,
      name: projectName,
      canonicalPath,
      gitRemote,
      createdAt,
      lastSeenAt: now,
    };
  }

  private static computeProjectId(canonicalPath: string, gitRemote?: string, name?: string): string {
    const hash = createHash('sha256');

    if (gitRemote) {
      // Normalize git remote (ssh vs https vs .git suffix)
      const normalizedRemote = gitRemote
        .trim()
        .toLowerCase()
        .replace(/^git@github\.com:/, 'https://github.com/')
        .replace(/\.git$/, '');
      hash.update(`git:${normalizedRemote}`);
    } else {
      // Deterministic hash based on canonical path and project name
      const normalizedPath = canonicalPath.replace(/\\/g, '/').toLowerCase();
      hash.update(`fs:${name || 'project'}:${normalizedPath}`);
    }

    return `proj_${hash.digest('hex').slice(0, 16)}`;
  }
}
