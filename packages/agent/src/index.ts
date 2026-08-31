/**
 * @sentinel/agent — Public API
 */

export type {
  AgentKernelConfig,
  RunOptions,
  AgentStepResult,
  VerificationResult,
} from './types.js';

export { AgentKernel } from './kernel.js';
export { AgentSession, type SessionOptions } from './session.js';
export { SessionManager, type ConsistencyCheckResult } from './session-manager.js';
export { PromptPlanner } from './planner.js';
export { VerificationEngine } from './verification.js';
