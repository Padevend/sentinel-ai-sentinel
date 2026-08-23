/**
 * @sentinel/tools — Tool types and registry
 *
 * Generic tool abstraction. Each tool has a name, description,
 * input schema (for the LLM), permission level, and an execute function.
 * Tools do one thing clearly — no "super tools" that combine operations.
 */

import type {
  ToolResult,
  ToolDefinition,
  PermissionLevel,
  EventBus,
  ToolCallId,
} from '@sentinel/core';

// ─── Tool Context ────────────────────────────────────────────────

/**
 * Runtime context provided to each tool during execution.
 * Contains the project root, event bus, and abort signal.
 */
export interface ToolContext {
  readonly projectRoot: string;
  readonly eventBus: EventBus;
  readonly signal?: AbortSignal;
}

// ─── Tool Interface ──────────────────────────────────────────────

/**
 * The contract every Sentinel tool must implement.
 */
export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly permissions: PermissionLevel;
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}

// ─── Tool Registry ───────────────────────────────────────────────

/**
 * Central registry of available tools.
 * The agent kernel queries this to know what tools are available
 * and to convert them to the LLM's tool format.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  /**
   * Register a tool. Throws if a tool with the same name already exists.
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Get a tool by name.
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools.
   */
  getAll(): Tool[] {
    return [...this.tools.values()];
  }

  /**
   * Convert all tools to LLM tool definitions.
   */
  toDefinitions(): ToolDefinition[] {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  /**
   * Execute a tool by name with the given input.
   */
  async execute(
    name: string,
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        output: `Unknown tool: "${name}". Available tools: ${[...this.tools.keys()].join(', ')}`,
        error: {
          code: 'UNKNOWN_TOOL',
          message: `Tool "${name}" not found`,
          recoverable: true,
          retryable: false,
        },
      };
    }

    const start = performance.now();
    try {
      const result = await tool.execute(input, context);
      const durationMs = Math.round(performance.now() - start);
      return {
        ...result,
        metadata: {
          ...(result.metadata ?? {}),
          durationMs,
          toolName: name,
        },
      };
    } catch (error) {
      const durationMs = Math.round(performance.now() - start);
      return {
        success: false,
        output: `Tool "${name}" failed: ${error instanceof Error ? error.message : String(error)}`,
        metadata: { durationMs, toolName: name },
        error: {
          code: 'TOOL_EXECUTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
          retryable: false,
        },
      };
    }
  }
}
