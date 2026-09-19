import type { ReasoningEffort } from '@sentinel/llm';

export interface ReasoningPlan {
  readonly effort?: ReasoningEffort;
  readonly native: boolean;
  readonly verificationPasses: number;
  readonly contextMultiplier: number;
}

/**
 * Maps one user-facing effort scale to provider-neutral orchestration policy.
 * Native providers receive the effort parameter; others get explicit
 * verification passes instead of an unsupported provider flag.
 */
export function createReasoningPlan(
  effort: ReasoningEffort | undefined,
  supportsNative: boolean,
): ReasoningPlan {
  if (!effort) {
    return { native: supportsNative, verificationPasses: 0, contextMultiplier: 1 };
  }

  const verificationPasses = supportsNative
    ? 0
    : effort === 'max'
      ? 2
      : effort === 'high'
        ? 1
        : 0;
  const contextMultiplier = { low: 0.75, medium: 1, high: 1.25, max: 1.5 }[effort];
  return { effort, native: supportsNative, verificationPasses, contextMultiplier };
}

export function buildVerificationPrompt(pass: number, totalPasses: number): string {
  return [
    'You are in Sentinel verification mode.',
    `Perform verification pass ${pass} of ${totalPasses}.`,
    'Check the proposed answer against the observed tool results and project context.',
    'Correct unsupported claims and return only the final user-facing answer.',
  ].join(' ');
}
