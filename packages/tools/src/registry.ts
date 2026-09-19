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
import type { PermissionEngine } from '@sentinel/permissions';
import { createPermissionRequest } from '@sentinel/permissions';

// ─── Tool Context ────────────────────────────────────────────────

/**
 * Runtime context provided to each tool during execution.
 * Contains the project root, event bus, and abort signal.
 */
export interface ToolContext {
  readonly projectRoot: string;
  readonly eventBus: EventBus;
  readonly signal?: AbortSignal;
  /** Required by the kernel path before any side effect is executed. */
  readonly permissionEngine?: PermissionEngine;
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

    const validationErrors = validateAgainstSchema(input, tool.inputSchema);
    if (validationErrors.length > 0) {
      return {
        success: false,
        output: `Invalid arguments for tool "${name}": ${validationErrors.join('; ')}`,
        error: {
          code: 'INVALID_TOOL_INPUT',
          message: validationErrors.join('; '),
          recoverable: true,
          retryable: false,
        },
      };
    }

    if (context.permissionEngine) {
      const request = createPermissionRequest(name, input);
      const decision = context.permissionEngine.evaluate(request);
      if (decision !== 'allow') {
        return {
          success: false,
          output: decision === 'ask'
            ? `Permission required before executing tool "${name}".`
            : `Tool "${name}" denied by the active permission policy.`,
          error: {
            code: decision === 'ask' ? 'PERMISSION_REQUIRED' : 'PERMISSION_DENIED',
            message: decision === 'ask' ? 'User confirmation is required.' : 'Permission policy denied the request.',
            recoverable: true,
            retryable: false,
          },
        };
      }
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

function validateAgainstSchema(input: unknown, schema: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const type = schema['type'];
  if (type === 'object') {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return ['value must be an object'];
    }
    const object = input as Record<string, unknown>;
    const required = Array.isArray(schema['required']) ? schema['required'].filter((value): value is string => typeof value === 'string') : [];
    for (const key of required) {
      if (!(key in object)) errors.push(`${key} is required`);
    }
    const properties = schema['properties'];
    if (typeof properties === 'object' && properties !== null && !Array.isArray(properties)) {
      for (const [key, propertySchema] of Object.entries(properties as Record<string, unknown>)) {
        if (!(key in object) || typeof propertySchema !== 'object' || propertySchema === null || Array.isArray(propertySchema)) continue;
        errors.push(...validateValue(object[key], propertySchema as Record<string, unknown>, key));
      }
    }
    return errors;
  }
  errors.push(...validateValue(input, schema, 'value'));
  return errors;
}

function validateValue(value: unknown, schema: Record<string, unknown>, path: string): string[] {
  const expected = schema['type'];
  if (value === undefined || expected === undefined) return [];
  const valid = expected === 'string' ? typeof value === 'string'
    : expected === 'number' ? typeof value === 'number' && Number.isFinite(value)
      : expected === 'boolean' ? typeof value === 'boolean'
        : expected === 'array' ? Array.isArray(value)
          : expected === 'object' ? typeof value === 'object' && value !== null && !Array.isArray(value)
            : true;
  if (!valid) return [`${path} must be ${String(expected)}`];
  if (expected === 'array' && Array.isArray(value) && typeof schema['items'] === 'object' && schema['items'] !== null && !Array.isArray(schema['items'])) {
    return value.flatMap((item, index) => validateValue(item, schema['items'] as Record<string, unknown>, `${path}[${index}]`));
  }
  return [];
}
