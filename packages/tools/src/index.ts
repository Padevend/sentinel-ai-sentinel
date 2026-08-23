/**
 * @sentinel/tools — Public API
 *
 * Re-exports tool registry, interfaces, and all built-in tools.
 */

export type { Tool, ToolContext } from './registry.js';
export { ToolRegistry } from './registry.js';

// Filesystem tools
export {
  listDirectoryTool,
  readFileTool,
  searchTextTool,
  writeFileTool,
  patchFileTool,
  deleteFileTool,
} from './filesystem.js';

// Shell tool
export { executeCommandTool } from './shell.js';

// Git tools
export {
  gitStatusTool,
  gitDiffTool,
  gitLogTool,
  gitBranchTool,
} from './git-tools.js';

// ─── Convenience: register all default tools ─────────────────────

import { ToolRegistry } from './registry.js';
import { listDirectoryTool, readFileTool, searchTextTool, writeFileTool, patchFileTool, deleteFileTool } from './filesystem.js';
import { executeCommandTool } from './shell.js';
import { gitStatusTool, gitDiffTool, gitLogTool, gitBranchTool } from './git-tools.js';

/**
 * Create a ToolRegistry pre-loaded with all built-in tools.
 */
export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // Filesystem
  registry.register(listDirectoryTool);
  registry.register(readFileTool);
  registry.register(searchTextTool);
  registry.register(writeFileTool);
  registry.register(patchFileTool);
  registry.register(deleteFileTool);

  // Shell
  registry.register(executeCommandTool);

  // Git
  registry.register(gitStatusTool);
  registry.register(gitDiffTool);
  registry.register(gitLogTool);
  registry.register(gitBranchTool);

  return registry;
}
