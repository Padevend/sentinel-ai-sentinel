/**
 * @sentinel/project — Project Indexer
 *
 * Scans, indexes, and builds an incremental index of project files and structural symbols.
 * Honors .gitignore and common ignores (node_modules, dist, etc.).
 * Persists index metadata to the StorageAdapter.
 */

import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import fg from 'fast-glob';
import ignore from 'ignore';
import type { StorageAdapter } from '@sentinel/storage';
import { createLogger } from '@sentinel/core';
import type { IndexedFile, ProjectMetadata, ProjectScanResult, StructuralSymbol } from './types.js';
import { detectProjectStack } from './detectors.js';
import { StructuralAnalyzer } from './structural-analyzer.js';
import { StructuralTwinBuilder } from "./structural-twin.js";

const logger = createLogger('project-indexer');

const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.sentinel/**',
  '**/coverage/**',
  '**/*.lock',
  '**/*.log',
];

export class ProjectIndexer {
  constructor(
    private readonly projectRoot: string,
    private readonly storage?: StorageAdapter,
  ) {}

  /**
   * Performs an incremental or full scan of the project workspace.
   */
  async scan(): Promise<ProjectScanResult> {
    const ig = await this.loadGitignore();

    // Find all files
    const allFiles = await fg('**/*', {
      cwd: this.projectRoot,
      dot: true,
      ignore: DEFAULT_IGNORE,
      onlyFiles: true,
    });

    const validFiles = allFiles.filter((file) => !ig.ignores(file));
    logger.info(`Scanning project: found ${validFiles.length} files`, { count: validFiles.length });

    const indexedFiles: IndexedFile[] = [];
    const allSymbols: StructuralSymbol[] = [];
    const sourceContents: Record<string, string> = {};
    const previousFiles = this.storage ? (await this.storage.get<IndexedFile[]>("project", "files").catch(() => null)) ?? [] : [];
    let reusedFiles = 0;
    let totalLines = 0;

    for (const relPath of validFiles) {
      const fullPath = join(this.projectRoot, relPath);
      try {
        const fileStat = await stat(fullPath);
        const language = this.detectLanguage(relPath);
        const previous = previousFiles.find((file) => file.path === relPath);
        const canReuseSymbols = previous?.size === fileStat.size && previous.modifiedAt === fileStat.mtimeMs && previous.symbols !== undefined;
        if (canReuseSymbols) reusedFiles++;

        // Only parse text/code files for structural symbols
        let fileSymbols: StructuralSymbol[] = [];
        let contentHash: string | undefined;
        if ((this.isCodeFile(relPath) || relPath.endsWith('.prisma')) && fileStat.size < 500_000) {
          const content = await readFile(fullPath, 'utf-8');
          sourceContents[relPath] = content;
          contentHash = createHash('sha256').update(content).digest('hex');
          totalLines += content.split('\n').length;
          fileSymbols = canReuseSymbols ? [...(previous.symbols ?? [])] : StructuralAnalyzer.analyze(relPath, content);
          allSymbols.push(...fileSymbols);
        }

        const indexedFile: IndexedFile = {
          path: relPath,
          size: fileStat.size,
          modifiedAt: fileStat.mtimeMs,
          language,
          id: `file:${createHash("sha1").update(relPath).digest("hex").slice(0, 20)}`,
          hash: contentHash,
          isTest: /(^|[._\/\-])(test|spec)([._\/\-]|$)/i.test(relPath),
          isGenerated: /(^|[\/])(dist|build|generated)([\/]|$)|\.d\.ts$/i.test(relPath),
          isConfig: /(^|[\/])(package\.json|tsconfig[^/]*|vite\.config[^/]*|next\.config[^/]*|prisma[\/]schema\.prisma)$/.test(relPath),
          symbols: fileSymbols.length > 0 ? fileSymbols : undefined,
        };

        indexedFiles.push(indexedFile);
      } catch (err) {
        logger.debug(`Could not read file ${relPath}`, { error: String(err) });
      }
    }

    const info = await detectProjectStack(this.projectRoot, indexedFiles.length);

    logger.info("Incremental index: reused " + reusedFiles + " file symbol sets", { reusedFiles, reparsedFiles: validFiles.length - reusedFiles });
    const twin = StructuralTwinBuilder.build(this.projectRoot, info, indexedFiles, allSymbols, sourceContents);
    const metadata: ProjectMetadata = {
      info,
      indexedAt: Date.now(),
      totalFiles: indexedFiles.length,
      totalLines,
    };

    // Save to storage if available
    if (this.storage) {
      try {
        await this.storage.set('project', 'metadata', metadata);
        await this.storage.set('project', 'files', indexedFiles);
        await this.storage.set('project', 'symbols', allSymbols);
        await this.storage.set('project', 'structural_twin', twin);
      } catch (err) {
        logger.warn('Failed to cache project index to storage', { error: String(err) });
      }
    }

    return {
      info,
      files: indexedFiles,
      symbols: allSymbols,
      twin,
    };
  }

  /**
   * Search indexed symbols by query.
   */
  async findSymbols(query: string, symbols: readonly StructuralSymbol[]): Promise<StructuralSymbol[]> {
    const q = query.toLowerCase();
    return symbols.filter((s) => s.name.toLowerCase().includes(q) || s.kind.toLowerCase().includes(q));
  }

  private async loadGitignore() {
    const ig = ignore();
    try {
      const gitignoreContent = await readFile(join(this.projectRoot, '.gitignore'), 'utf-8');
      ig.add(gitignoreContent);
    } catch {
      // No .gitignore present, continue with defaults
    }
    return ig;
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'TypeScript';
      case 'js':
      case 'jsx':
      case 'mjs':
      case 'cjs':
        return 'JavaScript';
      case 'json':
        return 'JSON';
      case 'md':
      case 'markdown':
        return 'Markdown';
      case 'py':
        return 'Python';
      case 'rs':
        return 'Rust';
      case 'go':
        return 'Go';
      case 'html':
        return 'HTML';
      case 'css':
      case 'scss':
        return 'CSS';
      case 'prisma':
        return 'Prisma';
      case 'yaml':
      case 'yml':
        return 'YAML';
      default:
        return 'Text';
    }
  }

  private isCodeFile(filePath: string): boolean {
    const codeExts = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'rs']);
    const ext = filePath.split('.').pop()?.toLowerCase();
    return ext ? codeExts.has(ext) : false;
  }
}
