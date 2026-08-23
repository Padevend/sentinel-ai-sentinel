/**
 * @sentinel/agent — Agent Session
 *
 * Encapsulates the conversation state, message history,
 * token metrics, and active session memory.
 */

import type { SessionId, Message, TokenUsage } from '@sentinel/core';
import type { MemoryEngine } from '@sentinel/memory';

export class AgentSession {
  public readonly id: SessionId;
  private readonly messages: Message[] = [];
  private totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  constructor(sessionId?: string, public readonly memory?: MemoryEngine) {
    this.id = (sessionId || `session-${Date.now()}`) as SessionId;
  }

  addMessage(message: Message): void {
    this.messages.push(message);
  }

  getMessages(): readonly Message[] {
    return this.messages;
  }

  clear(): void {
    this.messages.length = 0;
  }

  recordUsage(usage: TokenUsage): void {
    this.totalUsage = {
      promptTokens: this.totalUsage.promptTokens + usage.promptTokens,
      completionTokens: this.totalUsage.completionTokens + usage.completionTokens,
      totalTokens: this.totalUsage.totalTokens + usage.totalTokens,
    };
  }

  getUsage(): TokenUsage {
    return this.totalUsage;
  }
}
