import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { AgentKernel, AgentSession } from '@sentinel/agent';
import { createDefaultToolRegistry } from '@sentinel/tools';
import { PermissionManager } from '@sentinel/permissions';
import { ProjectIndexer } from '@sentinel/project';
import { ContextEngine } from '@sentinel/context';
import type { LLMProvider, ChatRequest, ChatResponse, ChatStreamChunk } from '@sentinel/llm';
import type { ToolCallId } from '@sentinel/core';

const TEST_DIR = join(process.cwd(), '.tmp-integration-test');

class DeterministicFixProvider implements LLMProvider {
  readonly id = 'test-provider';
  readonly name = 'DeterministicFix';
  readonly modelId = 'test-model';
  private step = 0;

  async listModels(): Promise<readonly never[]> { return []; }

  supportsNativeReasoningEffort(): boolean { return false; }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    this.step++;

    if (this.step === 1) {
      // Step 1: LLM decides to search for the buggy function
      return {
        content: 'Searching for validation logic in the codebase.',
        toolCalls: [
          {
            id: 'call-search' as ToolCallId,
            toolName: 'search_text',
            input: { pattern: 'isValidEmail' },
          },
        ],
        usage: { promptTokens: 30, completionTokens: 10, totalTokens: 40 },
        finishReason: 'tool_calls',
      };
    }

    if (this.step === 2) {
      // Step 2: LLM patches the file with proper email regex validation
      return {
        content: 'Fixing the isValidEmail implementation.',
        toolCalls: [
          {
            id: 'call-patch' as ToolCallId,
            toolName: 'patch_file',
            input: {
              path: 'validator.ts',
              patches: [
                {
                  search: 'return typeof email === \'string\' && email.length > 0;',
                  replace: 'return typeof email === \'string\' && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);',
                },
              ],
            },
          },
        ],
        usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
        finishReason: 'tool_calls',
      };
    }

    // Step 3: LLM concludes
    return {
      content: 'Email validation has been successfully fixed using regex.',
      toolCalls: [],
      usage: { promptTokens: 40, completionTokens: 15, totalTokens: 55 },
      finishReason: 'stop',
    };
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatStreamChunk> {
    const res = await this.chat(request);
    yield { type: 'content', content: res.content };
    yield { type: 'done', finishReason: res.finishReason };
  }
}

describe('Sentinel End-to-End Agent Integration', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    await writeFile(
      join(TEST_DIR, 'validator.ts'),
      `export function isValidEmail(email: string): boolean {\n  return typeof email === 'string' && email.length > 0;\n}\n`,
    );
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should find the buggy file, apply patch, and solve the problem', async () => {
    const tools = createDefaultToolRegistry();
    const permissions = new PermissionManager();
    permissions.setConfirmationHandler(async () => true);
    const provider = new DeterministicFixProvider();

    const indexer = new ProjectIndexer(TEST_DIR);
    const scanResult = await indexer.scan();
    const contextEngine = new ContextEngine(
      scanResult.info,
      scanResult.files,
      scanResult.symbols,
    );

    const kernel = new AgentKernel({
      projectRoot: TEST_DIR,
      provider,
      tools,
      permissions,
      contextEngine,
      maxIterations: 5,
    });

    const session = new AgentSession();
    const result = await kernel.run(
      'Fix the email validation bug in validator.ts',
      session,
    );

    expect(result.state).toBe('completed');
    expect(result.toolResults).toHaveLength(2);

    // Verify file on disk actually got modified!
    const updatedContent = await readFile(join(TEST_DIR, 'validator.ts'), 'utf-8');
    expect(updatedContent).toContain('/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/');
  });
});
