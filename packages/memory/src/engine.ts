/**
 * @sentinel/memory — Memory Engine
 *
 * Coordinates session memory, project memory, and tool history.
 */

import type { SessionId } from '@sentinel/core';
import type { StorageAdapter } from '@sentinel/storage';
import { SessionMemory } from './session-memory.js';
import { ProjectMemory } from './project-memory.js';
import { ToolHistory } from './tool-history.js';

export class MemoryEngine {
  readonly session: SessionMemory;
  readonly project: ProjectMemory;
  readonly toolHistory: ToolHistory;

  constructor(sessionId: SessionId, storage?: StorageAdapter) {
    this.session = new SessionMemory(sessionId);
    this.project = new ProjectMemory(storage);
    this.toolHistory = new ToolHistory();
  }

  getCombinedContext(): string {
    const sessionPart = this.session.formatContext();
    const toolPart = this.toolHistory.formatRecent();

    const sections: string[] = [];
    if (sessionPart) sections.push(sessionPart);
    if (toolPart) sections.push(`Recent actions:\n${toolPart}`);

    return sections.join('\n\n');
  }
}
