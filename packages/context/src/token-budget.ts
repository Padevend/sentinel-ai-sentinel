/**
 * @sentinel/context — Token Budget Estimator
 *
 * Fast token count estimator and truncation utility for context engineering.
 */

export class TokenBudget {
  /**
   * Fast conservative estimate of tokens for a given string (~3.8 chars per token for code/text).
   */
  static estimate(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 3.8);
  }

  /**
   * Truncates text to fit within a given token limit.
   */
  static truncate(text: string, maxTokens: number): string {
    if (maxTokens <= 0) return '';
    const estimated = this.estimate(text);
    if (estimated <= maxTokens) return text;

    const maxChars = Math.floor(maxTokens * 3.8);
    const suffix = '\n... [truncated due to context budget]';
    if (maxChars <= suffix.length) return text.substring(0, maxChars);
    return text.substring(0, maxChars - suffix.length) + suffix;
  }
}
