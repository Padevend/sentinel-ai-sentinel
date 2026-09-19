import { describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SkillsEngine } from '../index.js';

describe('SkillsEngine', () => {
  it('discovers new metadata and loads full content lazily', async () => {
    const root = join(process.cwd(), '.tmp-skills');
    const directory = join(root, '.sentinel', 'skills');
    await mkdir(directory, { recursive: true });
    const path = join(directory, 'testing.md');
    await writeFile(path, '---\nname: testing\ndescription: Run focused tests\n---\nUse the project test command.\n');

    const engine = new SkillsEngine({ projectRoot: root, globalDirectory: join(root, 'global-skills') });
    expect(engine.listAvailable()).toEqual([{ name: 'testing', description: 'Run focused tests', path }]);
    expect(await engine.load('testing')).toContain('Use the project test command.');

    await writeFile(join(directory, 'linting.md'), '---\nname: linting\ndescription: Check lint issues\n---\nLint guidance.\n');
    expect(engine.listAvailable().map((skill) => skill.name)).toEqual(['linting', 'testing']);
    await rm(root, { recursive: true, force: true });
  });
});
