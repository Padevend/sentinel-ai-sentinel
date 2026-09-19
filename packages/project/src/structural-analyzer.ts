/**
 * @sentinel/project - Deterministic TypeScript/JavaScript AST analyzer.
 *
 * The analyzer runs before an LLM call and extracts only structural facts:
 * imports, declarations, React components, and common HTTP routes.
 */

import ts from 'typescript';
import type { StructuralSymbol } from './types.js';

export class StructuralAnalyzer {
  static analyze(filePath: string, content: string): StructuralSymbol[] {
    const symbols: StructuralSymbol[] = [];
    const scriptKind = filePath.endsWith('.tsx')
      ? ts.ScriptKind.TSX
      : filePath.endsWith('.jsx')
        ? ts.ScriptKind.JSX
        : filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKind);
    const isReactFile = scriptKind === ts.ScriptKind.TSX || scriptKind === ts.ScriptKind.JSX;

    const add = (
      node: ts.Node,
      name: string,
      kind: StructuralSymbol['kind'],
      details = node.getText(sourceFile),
    ): void => {
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
      symbols.push({
        name,
        kind,
        filePath,
        line: start.line + 1,
        endLine: end.line + 1,
        details,
      });
    };

    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        add(node, node.moduleSpecifier.text, 'import');
      } else if (ts.isFunctionDeclaration(node) && node.name) {
        add(node, node.name.text, isReactFile && isComponentName(node.name.text) ? 'react_component' : 'function');
      } else if (ts.isClassDeclaration(node) && node.name) {
        add(node, node.name.text, 'class');
      } else if (ts.isInterfaceDeclaration(node)) {
        add(node, node.name.text, 'interface');
      } else if (ts.isTypeAliasDeclaration(node)) {
        add(node, node.name.text, 'type');
      } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const initializer = node.initializer;
        if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
          add(node, node.name.text, isReactFile && isComponentName(node.name.text) ? 'react_component' : 'function');
        }
      } else if (ts.isCallExpression(node)) {
        const route = getRoute(node);
        if (route) add(node, `${route.method} ${route.path}`, 'endpoint', `${route.method} route registered at ${route.path}`);
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return symbols;
  }
}

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function getRoute(node: ts.CallExpression): { method: string; path: string } | undefined {
  if (!ts.isPropertyAccessExpression(node.expression)) return undefined;
  const receiver = node.expression.expression;
  const method = node.expression.name.text.toLowerCase();
  if (!ts.isIdentifier(receiver)) return undefined;
  if (!['app', 'router', 'server'].includes(receiver.text)) return undefined;
  if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) return undefined;
  const firstArgument = node.arguments[0];
  if (!firstArgument || !ts.isStringLiteral(firstArgument)) return undefined;
  return { method: method.toUpperCase(), path: firstArgument.text };
}
