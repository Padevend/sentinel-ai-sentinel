import { describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FileContextEngine } from '../file-engine.js';

describe('FileContextEngine', () => {
  it('searches the cached index without rescanning for each query', async () => {
    const root = join(process.cwd(), '.tmp-file-context');
    await mkdir(join(root, 'src', 'auth'), { recursive: true });
    await writeFile(join(root, 'src', 'auth', 'service.ts'), 'export const service = true;');
    await writeFile(join(root, 'src', 'routes-auth.ts'), 'export const route = true;');
    const engine = new FileContextEngine(root, { watcher: false });
    const first = engine.search('auth', 10);
    const second = engine.search('auth', 10);
    expect(first.map((match) => match.path)).toEqual(expect.arrayContaining(['src/auth/service.ts', 'src/routes-auth.ts']));
    expect(second).toEqual(first);
    engine.close();
    await rm(root, { recursive: true, force: true });
  });
});
