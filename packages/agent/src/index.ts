/**
 * @sentinel/agent — Public API
 */

export type {
  AgentKernelConfig,
  RunOptions,
  AgentStepResult,
  VerificationResult,
  AgentEvent,
  AgentRun,
  UserInput,
} from './types.js';

export { AgentKernel } from './kernel.js';
export { AgentSession, type SessionOptions } from './session.js';
export { SessionManager, type ConsistencyCheckResult, type ResumeValidationOptions } from './session-manager.js';
export { PromptPlanner } from './planner.js';
export { VerificationEngine } from './verification.js';
export { createReasoningPlan, buildVerificationPrompt } from './reasoning.js';
export type { ReasoningPlan } from './reasoning.js';
