import { describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ProjectIndexer, StructuralTwinQuery } from '@sentinel/project';
import { ContextEngine } from '../engine.js';

describe('deterministic pre-analysis', () => {
  it('selects a structural subgraph and reports avoided exploratory reads', async () => {
    const root = join(process.cwd(), '.tmp-pre-analysis');
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'auth.ts'), 'export function authenticateUser() { return true; }');
    await writeFile(join(root, 'src', 'unrelated.ts'), 'export function billing() { return false; }');
    const scan = await new ProjectIndexer(root).scan();
    const context = new ContextEngine(scan.info, scan.files, scan.symbols, new StructuralTwinQuery(scan.twin!));
    const assembled = context.assembleContext({ query: 'authenticateUser auth' });
    expect(assembled.preAnalysis?.relevantFiles).toContain('src/auth.ts');
    expect(assembled.exploratoryReadsAvoided).toBeGreaterThan(0);
    expect(assembled.preAnalysis?.estimatedTokens).toBeGreaterThan(0);
    await rm(root, { recursive: true, force: true });
  });
});
