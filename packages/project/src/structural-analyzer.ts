/**
 * @sentinel/project — Structural Analyzer
 *
 * Deterministic code parsing for JavaScript / TypeScript files.
 * Extracts symbols (functions, classes, interfaces, types, endpoints, React components, imports).
 * Prepares the structural foundation for the future Behavioral Twin.
 */

import type { StructuralSymbol } from './types.js';

export class StructuralAnalyzer {
  /**
   * Analyzes file content and extracts structural symbols.
   */
  static analyze(filePath: string, content: string): StructuralSymbol[] {
    const symbols: StructuralSymbol[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();
      const lineNum = i + 1;

      // Skip comments
      if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
        continue;
      }

      // 1. React Component detection: function ComponentName(props) or const ComponentName = (props) =>
      const reactMatch = line.match(/(?:export\s+)?(?:function|const)\s+([A-Z][a-zA-Z0-9]+)\s*(?:=|:\s*React\.FC|\()/);
      if (reactMatch && (line.includes('JSX') || line.includes('React') || filePath.endsWith('.tsx') || filePath.endsWith('.jsx'))) {
        symbols.push({
          name: reactMatch[1]!,
          kind: 'react_component',
          filePath,
          line: lineNum,
          endLine: lineNum,
          details: line,
        });
        continue;
      }

      // 2. HTTP Route / Endpoint detection (Express / Fastify / Next.js / Nest)
      const routeMatch = line.match(/(?:app|router|server)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/i);
      if (routeMatch) {
        const method = routeMatch[1]!.toUpperCase();
        const routePath = routeMatch[2]!;
        symbols.push({
          name: `${method} ${routePath}`,
          kind: 'endpoint',
          filePath,
          line: lineNum,
          endLine: lineNum,
          details: `${method} route registered at ${routePath}`,
        });
        continue;
      }

      // 3. Class detection
      const classMatch = line.match(/(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z0-9_$]+)(?:\s+extends\s+([a-zA-Z0-9_$]+))?(?:\s+implements\s+([^{]+))?/);
      if (classMatch) {
        symbols.push({
          name: classMatch[1]!,
          kind: 'class',
          filePath,
          line: lineNum,
          endLine: lineNum,
          details: line,
        });
        continue;
      }

      // 4. Interface detection
      const interfaceMatch = line.match(/(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)/);
      if (interfaceMatch) {
        symbols.push({
          name: interfaceMatch[1]!,
          kind: 'interface',
          filePath,
          line: lineNum,
          endLine: lineNum,
          details: line,
        });
        continue;
      }

      // 5. Type alias detection
      const typeMatch = line.match(/(?:export\s+)?type\s+([a-zA-Z0-9_$]+)\s*=/);
      if (typeMatch) {
        symbols.push({
          name: typeMatch[1]!,
          kind: 'type',
          filePath,
          line: lineNum,
          endLine: lineNum,
          details: line,
        });
        continue;
      }

      // 6. Function declaration
      const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/);
      if (funcMatch) {
        symbols.push({
          name: funcMatch[1]!,
          kind: 'function',
          filePath,
          line: lineNum,
          endLine: lineNum,
          details: line,
        });
        continue;
      }

      // 7. Arrow function / Method assignment
      const arrowMatch = line.match(/(?:export\s+)?(?:const|let)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/);
      if (arrowMatch) {
        symbols.push({
          name: arrowMatch[1]!,
          kind: 'function',
          filePath,
          line: lineNum,
          endLine: lineNum,
          details: line,
        });
        continue;
      }

      // 8. Import statements
      const importMatch = line.match(/import\s+(?:.+?\s+from\s+)?['"`]([^'"`]+)['"`]/);
      if (importMatch) {
        symbols.push({
          name: importMatch[1]!,
          kind: 'import',
          filePath,
          line: lineNum,
          endLine: lineNum,
          details: line,
        });
      }
    }

    return symbols;
  }
}
