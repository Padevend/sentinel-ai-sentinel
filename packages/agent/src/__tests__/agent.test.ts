import { describe, it, expect } from 'vitest';
import { AgentKernel, AgentSession } from '../index.js';
import { createDefaultToolRegistry } from '@sentinel/tools';
import { PermissionManager } from '@sentinel/permissions';
import type { LLMProvider, ChatRequest, ChatResponse, ChatStreamChunk } from '@sentinel/llm';
import type { ToolCallId } from '@sentinel/core';

class MockLLMProvider implements LLMProvider {
  readonly name = 'Mock';
  readonly modelId = 'mock-v1';

  private callCount = 0;

  async chat(request: ChatRequest): Promise<ChatResponse> {
    this.callCount++;

    // Step 1: Agent decides to list directory
    if (this.callCount === 1) {
      return {
        content: 'Let me inspect the project structure.',
        toolCalls: [
          {
            id: 'call-1' as ToolCallId,
            toolName: 'list_directory',
            input: { path: '.' },
          },
        ],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        finishReason: 'tool_calls',
      };
    }

    // Step 2: Agent responds with final answer after seeing tool results
    return {
      content: 'I have analyzed the project structure and everything looks good.',
      toolCalls: [],
      usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
      finishReason: 'stop',
    };
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatStreamChunk> {
    const res = await this.chat(request);
    yield { type: 'content', content: res.content };
    yield { type: 'done', finishReason: res.finishReason };
  }
}

describe('@sentinel/agent', () => {
  it('should execute multi-step agentic loop (reason -> act -> observe -> complete)', async () => {
    const tools = createDefaultToolRegistry();
    const permissions = new PermissionManager();
    const provider = new MockLLMProvider();

    const kernel = new AgentKernel({
      projectRoot: process.cwd(),
      provider,
      tools,
      permissions,
      maxIterations: 5,
    });

    const session = new AgentSession();
    const result = await kernel.run('Analyze this project', session);

    expect(result.state).toBe('completed');
    expect(result.iterations).toBe(2);
    expect(result.toolResults).toHaveLength(1);
    expect(result.finalResponse).toContain('analyzed the project structure');
  });
});
