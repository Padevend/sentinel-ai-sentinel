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
  type SessionId,
} from '@sentinel/core';
import type { ToolContext } from '@sentinel/tools';
import type { ConfirmationHandler } from '@sentinel/permissions';
import type { ChatRequest, ChatResponse, ChatStreamChunk, ReasoningEffort } from '@sentinel/llm';
import type { AgentEvent, AgentKernelConfig, AgentRun, AgentStepResult, RunOptions, UserInput } from './types.js';
import { AgentSession } from './session.js';
import { PromptPlanner } from './planner.js';
import { VerificationEngine } from './verification.js';
import { buildVerificationPrompt, createReasoningPlan } from './reasoning.js';

const logger = createLogger('agent-kernel');

class AgentEventQueue implements AsyncIterator<AgentEvent> {
  private readonly values: AgentEvent[] = [];
  private readonly waiters: Array<(result: IteratorResult<AgentEvent>) => void> = [];
  private closed = false;

  push(event: AgentEvent): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ done: false, value: event });
    else this.values.push(event);
  }

  close(): void {
    this.closed = true;
    while (this.waiters.length > 0) this.waiters.shift()!({ done: true, value: undefined });
  }

  next(): Promise<IteratorResult<AgentEvent>> {
    const value = this.values.shift();
    if (value) return Promise.resolve({ done: false, value });
    if (this.closed) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

class HybridAgentRun implements AgentRun {
  readonly sessionId: SessionId;
  private started = false;
  private resultPromise?: Promise<AgentStepResult>;
  private queue?: AgentEventQueue;

  constructor(
    sessionId: SessionId,
    private readonly start: (queue?: AgentEventQueue) => Promise<AgentStepResult>,
  ) {
    this.sessionId = sessionId;
  }

  then<TResult1 = AgentStepResult, TResult2 = never>(
    onfulfilled?: ((value: AgentStepResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.startOnce().then(onfulfilled, onrejected);
  }

  [Symbol.asyncIterator](): AsyncIterator<AgentEvent> {
    if (!this.queue) this.queue = new AgentEventQueue();
    this.startOnce(this.queue);
    return this.queue;
  }

  private startOnce(queue?: AgentEventQueue): Promise<AgentStepResult> {
    if (!this.started) {
      this.started = true;
      this.resultPromise = this.start(queue);
    }
    return this.resultPromise!;
  }
}

export class AgentKernel {
  readonly eventBus = new SentinelEventBus();
  private state: AgentState = 'idle';
  private readonly verificationEngine: VerificationEngine;
  private provider: AgentKernelConfig['provider'];
  private readonly activeControllers = new Map<string, AbortController>();
  private readonly publicQueues = new Map<string, AgentEventQueue>();
  private reasoningEffort?: ReasoningEffort;

  constructor(private readonly config: AgentKernelConfig) {
    this.verificationEngine = new VerificationEngine(config.projectRoot, config.permissions);
    this.provider = config.provider;
    this.reasoningEffort = config.reasoningEffort;
  }

  private isCommandAuthorized(input: unknown): boolean {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return false;
    const command = (input as Record<string, unknown>)['command'];
    return typeof command === 'string' && !this.config.permissions.isCommandBlocked(command);
  }
  private commandPolicyRejection(): ToolResult {
    return {
      success: false,
      output: 'Command rejected by the active Sentinel permission policy.',
      error: {
        code: 'COMMAND_NOT_AUTHORIZED',
        message: 'Command is blocked or malformed for the active permission policy.',
        recoverable: true,
        retryable: false,
      },
    };
  }
  /** Attach the UI/session confirmation policy without exposing kernel internals. */
  setConfirmationHandler(handler: ConfirmationHandler | null): void {
    this.config.permissions.setConfirmationHandler(handler ?? (async () => false));
  }

  setProvider(provider: AgentKernelConfig["provider"]): void { this.provider = provider; }

  /** Change the unified reasoning policy for subsequent turns. */
  setReasoningEffort(effort: ReasoningEffort | undefined): void {
    this.reasoningEffort = effort;
  }

  getReasoningEffort(): ReasoningEffort | undefined {
    return this.reasoningEffort;
  }

  getState(): AgentState {
    return this.state;
  }

  run(userInput: UserInput, session: AgentSession, options?: RunOptions): AgentRun {
    return new HybridAgentRun(session.id, (queue) => {
      let unsubscribe: readonly (() => void)[] = [];
      if (queue) {
        this.publicQueues.set(session.id, queue);
        unsubscribe = this.subscribePublicEvents(session, queue);
      }
      const controller = new AbortController();
      const externalSignal = options?.signal;
      const abortFromExternal = () => controller.abort();
      externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
      if (externalSignal?.aborted) controller.abort();
      this.activeControllers.set(session.id, controller);
      return this.runInternal(userInput, session, { ...options, signal: controller.signal, stream: options?.stream ?? Boolean(queue) }).finally(() => {
        externalSignal?.removeEventListener('abort', abortFromExternal);
        this.activeControllers.delete(session.id);
        this.publicQueues.delete(session.id);
        for (const remove of unsubscribe) remove();
        queue?.close();
      });
    });
  }

  cancel(sessionId: string): void {
    this.activeControllers.get(sessionId)?.abort();
  }

  private subscribePublicEvents(session: AgentSession, queue: AgentEventQueue): readonly (() => void)[] {
    const unsubscribe = [
      this.eventBus.on('model_response_chunk', (event) => queue.push({ type: 'text_delta', content: event.content })),
      this.eventBus.on('tool_started', (event) => queue.push({
      type: 'tool_call_requested',
      call: { id: event.toolCallId, toolName: event.toolName, input: event.input },
      })),
      this.eventBus.on('tool_completed', (event) => queue.push({ type: 'tool_call_result', result: event.result })),
      this.eventBus.on('agent_state_changed', () => queue.push({ type: 'session_state', snapshot: session.getState() })),
    ];
    return unsubscribe;
  }

  private emitPublicEvent(sessionId: string, event: AgentEvent): void {
    this.publicQueues.get(sessionId)?.push(event);
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
  private async runInternal(
    userInput: string,
    session: AgentSession,
    options?: RunOptions,
  ): Promise<AgentStepResult> {
    const signal = options?.signal;
    const maxIterations = this.config.maxIterations ?? 25;
    const reasoningEffort = options?.reasoningEffort ?? this.reasoningEffort;
    const reasoningPlan = createReasoningPlan(reasoningEffort, this.supportsNativeReasoningEffort());
    const toolResultsAcc: ToolResult[] = [];

    this.setState('planning');

    // 1. Add user message to session
    session.addMessage({
      role: 'user',
      content: userInput,
      timestamp: new Date(),
    });
    await this.config.persistSession?.(session);

    // 2. Prepare context & planner system prompt
    let contextPrompt = '';
    if (this.config.contextEngine) {
      const assembled = this.config.contextEngine.assembleContext({
        query: userInput,
        recentFiles: session.memory?.session.getState().workingFiles,
        maxTokens: Math.round((this.config.contextTokenBudget ?? 3000) * reasoningPlan.contextMultiplier),
      });
      contextPrompt = assembled.formattedPrompt;
    }

    const memoryPrompt = this.config.memoryEngine?.getCombinedContext() ?? '';
    const skillsPrompt = this.config.skillsEngine
      ? await this.config.skillsEngine.prepareContext(userInput)
      : '';
    const systemPrompt = PromptPlanner.buildSystemPrompt(contextPrompt, memoryPrompt, skillsPrompt);

    let iterations = 0;
    let finalResponse = '';
    let hasCodeModification = false;

    try {
      while (iterations < maxIterations) {
        if (signal?.aborted) {
          this.setState('cancelled');
          session.setStatus('cancelled');
          await this.config.persistSession?.(session);
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
          modelId: this.provider.modelId,
          timestamp: new Date(),
        });

        const toolsList = this.config.tools.toDefinitions();
        const request: ChatRequest = {
          messages: session.getMessages(),
          tools: toolsList.length > 0 ? toolsList : undefined,
          systemPrompt,
          signal,
          reasoningEffort: reasoningPlan.native ? reasoningEffort : undefined,
          maxTokens: this.config.maxTokens,
          temperature: this.config.temperature,
        };
        const chatResponse = options?.stream
          ? await this.completeStreaming(request)
          : await this.provider.chat(request);

        session.recordUsage(chatResponse.usage);
        this.eventBus.emit({
          type: 'model_request_completed',
          modelId: this.provider.modelId,
          usage: chatResponse.usage,
          durationMs: 0,
          timestamp: new Date(),
        });

        // If content emitted, emit chunk
        if (chatResponse.content && !options?.stream) {
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
          for (let pass = 1; pass <= reasoningPlan.verificationPasses && iterations < maxIterations; pass++) {
            iterations++;
            const verification = await this.provider.chat({
              messages: session.getMessages(),
              systemPrompt: `${systemPrompt}\n\n${buildVerificationPrompt(pass, reasoningPlan.verificationPasses)}`,
              signal,
              maxTokens: this.config.maxTokens,
              temperature: this.config.temperature,
            });
            session.recordUsage(verification.usage);
            finalResponse = verification.content;
            session.addMessage({
              role: 'assistant',
              content: verification.content,
              toolCalls: verification.toolCalls.length > 0 ? verification.toolCalls : undefined,
              timestamp: new Date(),
            });
            this.eventBus.emit({
              type: 'model_response_chunk',
              content: verification.content,
              timestamp: new Date(),
            });
          }
          // No tools to run, turn complete.
          break;
        }

        // Execute tool calls
        this.setState('executing');

        for (const toolCall of chatResponse.toolCalls) {
          if (signal?.aborted) break;
          if (toolCall.toolName === 'execute_command' && !this.isCommandAuthorized(toolCall.input)) {
            const deniedResult = this.commandPolicyRejection();
            toolResultsAcc.push(deniedResult);
            session.addMessage({ role: 'tool', toolCallId: toolCall.id, content: deniedResult.output, timestamp: new Date() });
            await this.config.persistSession?.(session);
            continue;
          }

          // Check permissions
          const check = this.config.permissions.check(toolCall.toolName, toolCall.input);
          if (check.requiresConfirmation) {
            this.setState('waiting_for_confirmation');
            this.emitPublicEvent(session.id, { type: 'permission_required', request: check.request });
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
            this.config.permissions.recordSessionOverride(check.request, 'allow');
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
            permissionEngine: this.config.permissions,
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
          await this.config.persistSession?.(session);
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
      await this.config.persistSession?.(session);
      return {
        state: 'completed',
        finalResponse,
        toolResults: toolResultsAcc,
        iterations,
      };
    } catch (error) {
      if (signal?.aborted) {
        this.setState('cancelled');
        session.setStatus('cancelled');
        await this.config.persistSession?.(session);
        return {
          state: 'cancelled',
          finalResponse: 'Operation cancelled by user.',
          toolResults: toolResultsAcc,
          iterations,
        };
      }
      this.setState('failed');
      session.setStatus('failed');
      await this.config.persistSession?.(session);
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emitPublicEvent(session.id, { type: 'error', error: error instanceof Error ? error : new Error(errorMsg) });
      return {
        state: 'failed',
        finalResponse: `Error during agent execution: ${errorMsg}`,
        toolResults: toolResultsAcc,
        iterations,
      };
    }
  }

  private supportsNativeReasoningEffort(): boolean {
    return typeof this.provider.supportsNativeReasoningEffort === 'function'
      && this.provider.supportsNativeReasoningEffort();
  }

  private async completeStreaming(request: ChatRequest): Promise<ChatResponse> {
    const stream = typeof this.provider.complete === 'function'
      ? this.provider.complete({
        modelId: this.provider.modelId,
        messages: request.messages,
        tools: request.tools,
        reasoningEffort: request.reasoningEffort,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        signal: request.signal,
        systemPrompt: request.systemPrompt,
      })
      : this.provider.chatStream(request);
    let content = '';
    const toolCalls: ToolCall[] = [];
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let finishReason: ChatResponse['finishReason'] = 'stop';

    for await (const chunk of stream) {
      this.consumeStreamChunk(chunk, toolCalls, (text) => {
        content += text;
        this.eventBus.emit({ type: 'model_response_chunk', content: text, timestamp: new Date() });
      }, (nextUsage) => { usage = nextUsage; }, (nextReason) => { finishReason = nextReason; });
    }

    return { content, toolCalls, usage, finishReason };
  }

  private consumeStreamChunk(
    chunk: ChatStreamChunk,
    toolCalls: ToolCall[],
    appendContent: (content: string) => void,
    setUsage: (usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => void,
    setFinishReason: (reason: ChatResponse['finishReason']) => void,
  ): void {
    switch (chunk.type) {
      case 'content':
        appendContent(chunk.content);
        break;
      case 'tool_call_complete': {
        let input: unknown = chunk.arguments;
        try {
          input = JSON.parse(chunk.arguments) as unknown;
        } catch {
          // Keep malformed JSON as a string so ToolRegistry can return a
          // structured validation error to the model instead of crashing.
        }
        toolCalls.push({ id: chunk.toolCallId as ToolCallId, toolName: chunk.toolName, input });
        break;
      }
      case 'usage':
        setUsage(chunk.usage);
        break;
      case 'done':
        setFinishReason(chunk.finishReason);
        break;
      case 'tool_call_start':
      case 'tool_call_delta':
        break;
    }
  }
}
