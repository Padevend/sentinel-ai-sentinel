/**
 * @sentinel/project — Project Indexer
 *
 * Scans, indexes, and builds an incremental index of project files and structural symbols.
 * Honors .gitignore and common ignores (node_modules, dist, etc.).
 * Persists index metadata to the StorageAdapter.
 */

import { readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import fg from 'fast-glob';
import ignore from 'ignore';
import type { StorageAdapter } from '@sentinel/storage';
import { createLogger } from '@sentinel/core';
import type { IndexedFile, ProjectMetadata, ProjectScanResult, StructuralSymbol } from './types.js';
import { detectProjectStack } from './detectors.js';
import { StructuralAnalyzer } from './structural-analyzer.js';

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
    let totalLines = 0;

    for (const relPath of validFiles) {
      const fullPath = join(this.projectRoot, relPath);
      try {
        const fileStat = await stat(fullPath);
        const language = this.detectLanguage(relPath);

        // Only parse text/code files for structural symbols
        let fileSymbols: StructuralSymbol[] = [];
        if (this.isCodeFile(relPath) && fileStat.size < 500_000) {
          const content = await readFile(fullPath, 'utf-8');
          totalLines += content.split('\n').length;
          fileSymbols = StructuralAnalyzer.analyze(relPath, content);
          allSymbols.push(...fileSymbols);
        }

        const indexedFile: IndexedFile = {
          path: relPath,
          size: fileStat.size,
          modifiedAt: fileStat.mtimeMs,
          language,
          symbols: fileSymbols.length > 0 ? fileSymbols : undefined,
        };

        indexedFiles.push(indexedFile);
      } catch (err) {
        logger.debug(`Could not read file ${relPath}`, { error: String(err) });
      }
    }

    const info = await detectProjectStack(this.projectRoot, indexedFiles.length);

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
      } catch (err) {
        logger.warn('Failed to cache project index to storage', { error: String(err) });
      }
    }

    return {
      info,
      files: indexedFiles,
      symbols: allSymbols,
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
