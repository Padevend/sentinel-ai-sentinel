/**
 * @sentinel/project — Project Stack Detectors
 *
 * Automatically inspects package.json, configs, lockfiles, and directory patterns
 * to identify the tech stack (languages, frameworks, test runners, package manager).
 */

import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { GitClient } from '@sentinel/git';
import type { ProjectInfo, AbsolutePath } from '@sentinel/core';

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readPackageJson(root: string): Promise<PackageJson | null> {
  try {
    const content = await readFile(join(root, 'package.json'), 'utf-8');
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
}

export async function detectProjectStack(projectRoot: string, fileCount = 0): Promise<ProjectInfo> {
  const pkg = await readPackageJson(projectRoot);
  const git = new GitClient(projectRoot);
  const hasGit = await git.isRepository();

  const languages: string[] = [];
  const frameworks: string[] = [];
  let packageManager: string | null = null;
  let testFramework: string | null = null;

  // Package manager detection via lockfiles
  if (await fileExists(join(projectRoot, 'pnpm-lock.yaml'))) {
    packageManager = 'pnpm';
  } else if (await fileExists(join(projectRoot, 'yarn.lock'))) {
    packageManager = 'yarn';
  } else if (await fileExists(join(projectRoot, 'package-lock.json'))) {
    packageManager = 'npm';
  } else if (await fileExists(join(projectRoot, 'bun.lockb')) || await fileExists(join(projectRoot, 'bun.lock'))) {
    packageManager = 'bun';
  }

  // TypeScript / JavaScript detection
  if (await fileExists(join(projectRoot, 'tsconfig.json')) || pkg?.devDependencies?.['typescript'] || pkg?.dependencies?.['typescript']) {
    languages.push('TypeScript');
  }
  if (pkg) {
    if (!languages.includes('TypeScript')) {
      languages.push('JavaScript');
    }
  }

  // Python
  if (await fileExists(join(projectRoot, 'pyproject.toml')) || await fileExists(join(projectRoot, 'requirements.txt')) || await fileExists(join(projectRoot, 'Pipfile'))) {
    languages.push('Python');
  }

  // Rust
  if (await fileExists(join(projectRoot, 'Cargo.toml'))) {
    languages.push('Rust');
  }

  // Go
  if (await fileExists(join(projectRoot, 'go.mod'))) {
    languages.push('Go');
  }

  // Framework detection via dependencies
  if (pkg) {
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

    if (deps['next']) frameworks.push('Next.js');
    if (deps['react'] && !deps['next']) frameworks.push('React');
    if (deps['vue'] || deps['nuxt']) frameworks.push(deps['nuxt'] ? 'Nuxt' : 'Vue');
    if (deps['@angular/core']) frameworks.push('Angular');
    if (deps['svelte'] || deps['@sveltejs/kit']) frameworks.push('Svelte');
    if (deps['express']) frameworks.push('Express');
    if (deps['fastify']) frameworks.push('Fastify');
    if (deps['@nestjs/core']) frameworks.push('NestJS');
    if (deps['prisma'] || deps['@prisma/client']) frameworks.push('Prisma');
    if (deps['tailwindcss']) frameworks.push('TailwindCSS');

    // Test framework
    if (deps['vitest']) testFramework = 'Vitest';
    else if (deps['jest'] || deps['@types/jest']) testFramework = 'Jest';
    else if (deps['mocha']) testFramework = 'Mocha';
    else if (deps['playwright'] || deps['@playwright/test']) testFramework = 'Playwright';
    else if (deps['cypress']) testFramework = 'Cypress';
  }

  const name = pkg?.name || projectRoot.split(/[\\/]/).filter(Boolean).pop() || 'sentinel-project';

  return {
    name,
    rootPath: projectRoot as AbsolutePath,
    languages: languages.length > 0 ? languages : ['Unknown'],
    frameworks,
    packageManager,
    testFramework,
    hasGit,
    scripts: pkg?.scripts ?? {},
    fileCount,
  };
}
