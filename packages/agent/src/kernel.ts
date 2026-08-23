/**
 * @sentinel/agent — Agent Kernel
 *
 * The core orchestration loop for Sentinel.
 * Implements the agentic loop: reason -> act -> observe -> adapt.
 * Supports tool calling, streaming responses, user confirmation,
 * permission enforcement, cancellation via AbortSignal, and automatic verification.
 */

import {
  SentinelEventBus,
  createLogger,
  type AgentState,
  type Message,
  type ToolCall,
  type ToolResult,
  type ToolCallId,
} from '@sentinel/core';
import type { ToolContext } from '@sentinel/tools';
import type { AgentKernelConfig, AgentStepResult, RunOptions } from './types.js';
import { AgentSession } from './session.js';
import { PromptPlanner } from './planner.js';
import { VerificationEngine } from './verification.js';

const logger = createLogger('agent-kernel');

export class AgentKernel {
  readonly eventBus = new SentinelEventBus();
  private state: AgentState = 'idle';
  private readonly verificationEngine: VerificationEngine;

  constructor(private readonly config: AgentKernelConfig) {
    this.verificationEngine = new VerificationEngine(config.projectRoot);
  }

  getState(): AgentState {
    return this.state;
  }

  private setState(newState: AgentState): void {
    const previousState = this.state;
    this.state = newState;
    this.eventBus.emit({
      type: 'agent_state_changed',
      previousState,
      newState,
      timestamp: new Date(),
    });
  }

  /**
   * Runs an agent turn with the given user prompt.
   */
  async run(
    userInput: string,
    session: AgentSession,
    options?: RunOptions,
  ): Promise<AgentStepResult> {
    const signal = options?.signal;
    const maxIterations = this.config.maxIterations ?? 25;
    const toolResultsAcc: ToolResult[] = [];

    this.setState('planning');

    // 1. Add user message to session
    session.addMessage({
      role: 'user',
      content: userInput,
      timestamp: new Date(),
    });

    // 2. Prepare context & planner system prompt
    let contextPrompt = '';
    if (this.config.contextEngine) {
      const assembled = this.config.contextEngine.assembleContext({
        query: userInput,
        recentFiles: session.memory?.session.getState().workingFiles,
      });
      contextPrompt = assembled.formattedPrompt;
    }

    const memoryPrompt = this.config.memoryEngine?.getCombinedContext() ?? '';
    const systemPrompt = PromptPlanner.buildSystemPrompt(contextPrompt, memoryPrompt);

    let iterations = 0;
    let finalResponse = '';
    let hasCodeModification = false;

    try {
      while (iterations < maxIterations) {
        if (signal?.aborted) {
          this.setState('cancelled');
          return {
            state: 'cancelled',
            finalResponse: 'Operation cancelled by user.',
            toolResults: toolResultsAcc,
            iterations,
          };
        }

        iterations++;
        this.setState('planning');

        // Request LLM
        this.eventBus.emit({
          type: 'model_request_started',
          modelId: this.config.provider.modelId,
          timestamp: new Date(),
        });

        const toolsList = this.config.tools.toDefinitions();
        const chatResponse = await this.config.provider.chat({
          messages: session.getMessages(),
          tools: toolsList.length > 0 ? toolsList : undefined,
          systemPrompt,
          signal,
        });

        session.recordUsage(chatResponse.usage);
        this.eventBus.emit({
          type: 'model_request_completed',
          modelId: this.config.provider.modelId,
          usage: chatResponse.usage,
          durationMs: 0,
          timestamp: new Date(),
        });

        // If content emitted, emit chunk
        if (chatResponse.content) {
          this.eventBus.emit({
            type: 'model_response_chunk',
            content: chatResponse.content,
            timestamp: new Date(),
          });
        }

        // Record assistant response in session history
        session.addMessage({
          role: 'assistant',
          content: chatResponse.content,
          toolCalls: chatResponse.toolCalls.length > 0 ? chatResponse.toolCalls : undefined,
          timestamp: new Date(),
        });

        finalResponse = chatResponse.content;

        // Check if there are tool calls to execute
        if (!chatResponse.toolCalls || chatResponse.toolCalls.length === 0) {
          // No tools to run, turn complete
          break;
        }

        // Execute tool calls
        this.setState('executing');

        for (const toolCall of chatResponse.toolCalls) {
          if (signal?.aborted) break;

          // Check permissions
          const check = this.config.permissions.check(toolCall.toolName);
          if (check.requiresConfirmation) {
            this.setState('waiting_for_confirmation');
            const approved = await this.config.permissions.requestConfirmation(check);
            if (!approved) {
              const deniedResult: ToolResult = {
                success: false,
                output: `Tool execution for "${toolCall.toolName}" was denied by the user.`,
                error: {
                  code: 'PERMISSION_DENIED',
                  message: 'User rejected permission',
                  recoverable: true,
                  retryable: false,
                },
              };

              session.addMessage({
                role: 'tool',
                toolCallId: toolCall.id,
                content: deniedResult.output,
                timestamp: new Date(),
              });
              toolResultsAcc.push(deniedResult);
              continue;
            }
          }

          this.setState('executing');
          this.eventBus.emit({
            type: 'tool_started',
            toolName: toolCall.toolName,
            toolCallId: toolCall.id,
            input: toolCall.input,
            timestamp: new Date(),
          });

          // Check for code modification tools to trigger verification
          if (toolCall.toolName === 'write_file' || toolCall.toolName === 'patch_file' || toolCall.toolName === 'delete_file') {
            hasCodeModification = true;
            const inputPath = (toolCall.input as { path?: string })?.path;
            if (inputPath && session.memory) {
              session.memory.session.addWorkingFile(inputPath);
            }
          }

          const toolContext: ToolContext = {
            projectRoot: this.config.projectRoot,
            eventBus: this.eventBus,
            signal,
          };

          const result = await this.config.tools.execute(
            toolCall.toolName,
            toolCall.input,
            toolContext,
          );

          toolResultsAcc.push(result);

          this.eventBus.emit({
            type: 'tool_completed',
            toolName: toolCall.toolName,
            toolCallId: toolCall.id,
            result,
            durationMs: result.metadata?.durationMs ?? 0,
            timestamp: new Date(),
          });

          // Record in session memory & message history
          session.memory?.toolHistory.record(
            toolCall.toolName,
            toolCall.input,
            result.output,
            result.success,
          );

          session.addMessage({
            role: 'tool',
            toolCallId: toolCall.id,
            content: result.output,
            timestamp: new Date(),
          });
        }
      }

      // Auto-verification after code modifications if requested
      if (options?.autoVerify && hasCodeModification) {
        this.setState('verifying');
        const verification = await this.verificationEngine.verify(undefined, signal);
        if (!verification.passed) {
          logger.info('Auto-verification found errors after modifications', { failed: verification.failedTests });
        }
      }

      this.setState('completed');
      return {
        state: 'completed',
        finalResponse,
        toolResults: toolResultsAcc,
        iterations,
      };
    } catch (error) {
      this.setState('failed');
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        state: 'failed',
        finalResponse: `Error during agent execution: ${errorMsg}`,
        toolResults: toolResultsAcc,
        iterations,
      };
    }
  }
}
