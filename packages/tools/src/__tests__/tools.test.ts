import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { SentinelEventBus } from '@sentinel/core';
import {
  ToolRegistry,
  listDirectoryTool,
  readFileTool,
  searchTextTool,
  writeFileTool,
  patchFileTool,
  deleteFileTool,
  type ToolContext,
} from '../index.js';

const TEST_DIR = join(process.cwd(), '.tmp-tools-test');

describe('@sentinel/tools', () => {
  const eventBus = new SentinelEventBus();
  const context: ToolContext = {
    projectRoot: TEST_DIR,
    eventBus,
  };

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    await writeFile(join(TEST_DIR, 'test.txt'), 'line 1\nline 2 with searchterm\nline 3\n');
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should list directory contents', async () => {
    const result = await listDirectoryTool.execute({ path: '.' }, context);
    expect(result.success).toBe(true);
    expect(result.output).toContain('test.txt');
  });

  it('should read file with line numbers', async () => {
    const result = await readFileTool.execute({ path: 'test.txt' }, context);
    expect(result.success).toBe(true);
    expect(result.output).toContain('line 2 with searchterm');
    expect(result.output).toContain('1 │ line 1');
  });

  it('should search text across files', async () => {
    const result = await searchTextTool.execute({ pattern: 'searchterm' }, context);
    expect(result.success).toBe(true);
    expect(result.output).toContain('test.txt:2');
  });

  it('should patch files cleanly', async () => {
    const patchResult = await patchFileTool.execute(
      {
        path: 'test.txt',
        patches: [{ search: 'searchterm', replace: 'replacedterm' }],
      },
      context,
    );
    expect(patchResult.success).toBe(true);

    const readResult = await readFileTool.execute({ path: 'test.txt' }, context);
    expect(readResult.output).toContain('replacedterm');
    expect(readResult.output).not.toContain('searchterm');
  });

  it('should prevent path traversal outside project root', async () => {
    const result = await readFileTool.execute({ path: '../../etc/passwd' }, context);
    expect(result.success).toBe(false);
    expect(result.output).toContain('outside the project root');
  });
});
