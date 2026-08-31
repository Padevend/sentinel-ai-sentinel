/**
 * @sentinel/project — Project Detector
 *
 * Traverses upwards from current working directory to identify the true
 * project root according to strict priority rules:
 * 1. Git repository (.git)
 * 2. Workspace manifest (pnpm-workspace.yaml, lerna.json, go.work, Cargo.lock)
 * 3. Package manifest (package.json, pyproject.toml, Cargo.toml, go.mod, etc.)
 * 4. Existing .sentinel directory
 * 5. Fallback to start directory
 */

import { access, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import type { ProjectRoot } from '@sentinel/core';

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export class ProjectDetector {
  /**
   * Identifies the project root directory starting from a given directory (defaults to process.cwd()).
   */
  static async detectRoot(startDir = process.cwd()): Promise<ProjectRoot> {
    let current = resolve(startDir);
    let firstManifestMatch: string | null = null;
    let firstSentinelMatch: string | null = null;

    while (true) {
      // 1. Check for .git repository (highest confidence)
      if (await pathExists(join(current, '.git'))) {
        return {
          path: current,
          detectionMethod: 'git',
          confidence: 1.0,
        };
      }

      // 2. Check for monorepo workspace markers
      const workspaceMarkers = [
        'pnpm-workspace.yaml',
        'lerna.json',
        'go.work',
        'Cargo.lock',
      ];
      for (const marker of workspaceMarkers) {
        if (await pathExists(join(current, marker))) {
          return {
            path: current,
            detectionMethod: 'workspace',
            confidence: 0.95,
          };
        }
      }

      // Check for .sentinel directory
      if (!firstSentinelMatch && (await pathExists(join(current, '.sentinel')))) {
        firstSentinelMatch = current;
      }

      // Check for package manifests
      const packageManifests = [
        'package.json',
        'pyproject.toml',
        'requirements.txt',
        'Cargo.toml',
        'go.mod',
        'pom.xml',
        'build.gradle',
        'composer.json',
      ];
      if (!firstManifestMatch) {
        for (const manifest of packageManifests) {
          if (await pathExists(join(current, manifest))) {
            firstManifestMatch = current;
            break;
          }
        }
      }

      const parent = dirname(current);
      if (parent === current) {
        // Reached filesystem root
        break;
      }
      current = parent;
    }

    if (firstSentinelMatch) {
      return {
        path: firstSentinelMatch,
        detectionMethod: 'workspace',
        confidence: 0.9,
      };
    }

    if (firstManifestMatch) {
      return {
        path: firstManifestMatch,
        detectionMethod: 'manifest',
        confidence: 0.85,
      };
    }

    // Fallback to start directory
    return {
      path: resolve(startDir),
      detectionMethod: 'cwd',
      confidence: 0.5,
    };
  }
}
