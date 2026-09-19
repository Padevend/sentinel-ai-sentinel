import { createHash } from 'node:crypto';
import { dirname, join, normalize } from 'node:path';
import type { ProjectInfo } from '@sentinel/core';
import type { EntityKind, IndexedFile, KnowledgeSource, ProjectManifest, RelationType, StructuralEntity, StructuralRelation, StructuralSymbol, StructuralTwin } from './types.js';

const digest = (value: string): string => createHash('sha1').update(value).digest('hex').slice(0, 20);
const fileId = (path: string): string => `file:${digest(path)}`;
const symbolId = (symbol: StructuralSymbol): string => `symbol:${digest(`${symbol.filePath}:${symbol.name}:${symbol.line}`)}`;
const location = (file: string, line: number) => ({ file, startLine: line, startColumn: 0, endLine: line, endColumn: 0 });
const source = (file: string, line: number): KnowledgeSource => ({ type: 'ast', file, location: location(file, line), timestamp: Date.now() });

export class StructuralTwinBuilder {
  static build(rootPath: string, info: ProjectInfo, files: readonly IndexedFile[], symbols: readonly StructuralSymbol[], contents: Readonly<Record<string, string>>): StructuralTwin {
    const entities: StructuralEntity[] = [];
    const relations: StructuralRelation[] = [];
    const entityIds = new Set<string>();
    const relationIds = new Set<string>();
    const symbolByName = new Map<string, StructuralSymbol[]>();
    const addEntity = (entity: StructuralEntity): void => { if (!entityIds.has(entity.id)) { entityIds.add(entity.id); entities.push(entity); } };
    const addRelation = (from: string, to: string, type: RelationType, file: string, line: number, confidence = 1): void => {
      if (from === to) return;
      const relationId = `relation:${digest(`${from}:${to}:${type}`)}`;
      if (relationIds.has(relationId)) return;
      relationIds.add(relationId);
      relations.push({ id: relationId, sourceId: from, targetId: to, type, confidence, status: confidence === 1 ? 'observed' : 'inferred', sources: [source(file, line)] });
    };
    for (const file of files) {
      addEntity({ id: fileId(file.path), kind: 'file', name: file.path, source: location(file.path, 1), metadata: { language: file.language, size: file.size }, status: 'observed', confidence: 1 });
    }
    for (const symbol of symbols) {
      const kind: EntityKind = symbol.kind === 'endpoint' ? 'endpoint' : symbol.kind === 'react_component' ? 'component' : 'symbol';
      addEntity({ id: symbolId(symbol), kind, name: symbol.name, source: location(symbol.filePath, symbol.line), metadata: { symbolKind: symbol.kind }, status: 'observed', confidence: 1 });
      addRelation(fileId(symbol.filePath), symbolId(symbol), 'exports', symbol.filePath, symbol.line, symbol.details?.startsWith('export') ? 1 : 0.9);
      const named = symbolByName.get(symbol.name) ?? [];
      named.push(symbol);
      symbolByName.set(symbol.name, named);
    }
    for (const file of files) {
      const content = contents[file.path] ?? '';
      const fileSymbols = symbols.filter((symbol) => symbol.filePath === file.path);
      for (const imported of fileSymbols.filter((symbol) => symbol.kind === 'import')) {
        if (!imported.name.startsWith('.')) continue;
        const base = normalize(join(dirname(file.path), imported.name));
        const target = files.find((candidate) => candidate.path === base || candidate.path.startsWith(`${base}.`) || candidate.path === `${base}/index.ts` || candidate.path === `${base}/index.tsx`);
        if (target) addRelation(fileId(file.path), fileId(target.path), 'imports', file.path, imported.line);
      }
      for (const call of content.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
        const target = symbolByName.get(call[1] ?? '')?.find((candidate) => candidate.filePath !== file.path);
        if (!target) continue;
        const line = content.slice(0, call.index ?? 0).split('\n').length;
        const caller = fileSymbols.filter((candidate) => candidate.kind !== 'import' && candidate.line <= line).sort((a, b) => b.line - a.line)[0];
        if (caller) addRelation(symbolId(caller), symbolId(target), 'calls', file.path, line, 0.9);
      }
      for (const jsx of content.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)) {
        const target = symbolByName.get(jsx[1] ?? '')?.find((candidate) => candidate.kind === 'react_component');
        const owner = fileSymbols.find((candidate) => candidate.kind === 'react_component');
        if (owner && target) addRelation(symbolId(owner), symbolId(target), 'renders', file.path, owner.line, 0.85);
      }
      if (file.isTest || /(^|[._/-])(test|spec)([._/-]|$)/i.test(file.path)) {
        for (const [name, candidates] of symbolByName) {
          const target = candidates[0];
          if (target && name.length > 2 && content.includes(name)) addRelation(fileId(file.path), symbolId(target), 'tests', file.path, 1, 0.75);
        }
      }
      for (const model of content.matchAll(/\bmodel\s+([A-Za-z_$][\w$]*)\s*\{/g)) {
        const name = model[1] ?? '';
        const line = content.slice(0, model.index ?? 0).split('\n').length;
        addEntity({ id: `model:${digest(`${file.path}:${name}`)}`, kind: 'database_model', name, source: location(file.path, line), metadata: { provider: 'prisma' }, status: 'observed', confidence: 1 });
      }
    }
    const roots = [...new Set(files.map((file) => file.path.split('/')[0]).filter((root): root is string => Boolean(root)))];
    const manifest: ProjectManifest = {
      id: `project:${digest(rootPath)}`, rootPath, languages: info.languages, frameworks: info.frameworks,
      sourceDirectories: roots.filter((root) => !['.git', '.sentinel'].includes(root)),
      testDirectories: roots.filter((root) => /test|spec/i.test(root)),
      configFiles: files.filter((file) => file.isConfig || /(^|\/)(package.json|tsconfig[^/]*|vite.config[^/]*|next.config[^/]*|prisma\/schema.prisma)$/.test(file.path)).map((file) => file.path),
      entrypoints: files.filter((file) => /(^|\/)(main|index|server|app)\.(tsx?|jsx?)$/.test(file.path)).map((file) => file.path),
      scripts: info.scripts,
    };
    return { version: 1, manifest, files, symbols, entities, relations, indexedAt: Date.now() };
  }
}

export class StructuralTwinQuery {
  constructor(private readonly twin: StructuralTwin) {}
  getSnapshot(): StructuralTwin { return this.twin; }
  findSymbol(name: string): readonly StructuralEntity[] { return this.twin.entities.filter((entity) => ['symbol', 'component', 'hook', 'endpoint'].includes(entity.kind) && entity.name.toLowerCase().includes(name.toLowerCase())); }
  findCallers(entityId: string): readonly StructuralEntity[] { return this.related(entityId, 'calls', 'targetId'); }
  findCallees(entityId: string): readonly StructuralEntity[] { return this.related(entityId, 'calls', 'sourceId'); }
  findImports(fileOrId: string): readonly StructuralEntity[] { return this.related(fileOrId.startsWith('file:') ? fileOrId : fileId(fileOrId), 'imports', 'sourceId'); }
  findRoutes(): readonly StructuralEntity[] { return this.twin.entities.filter((entity) => entity.kind === 'endpoint'); }
  findComponents(): readonly StructuralEntity[] { return this.twin.entities.filter((entity) => entity.kind === 'component'); }
  findDatabaseModels(): readonly StructuralEntity[] { return this.twin.entities.filter((entity) => entity.kind === 'database_model'); }
  findTestsFor(entityId: string): readonly StructuralEntity[] { return this.related(entityId, 'tests', 'targetId'); }
  findImpact(entityId: string): readonly StructuralEntity[] {
    const direct = this.related(entityId, 'calls', 'targetId');
    const indirect = direct.flatMap((entity) => this.related(entity.id, 'calls', 'targetId'));
    return [...new Map([...direct, ...indirect].map((entity) => [entity.id, entity])).values()];
  }
  formatSummary(): string {
    const count = (kind: EntityKind): number => this.twin.entities.filter((entity) => entity.kind === kind).length;
    return [`Project: ${this.twin.manifest.rootPath}`, `Languages: ${this.twin.manifest.languages.join(', ')}`, `Frameworks: ${this.twin.manifest.frameworks.join(', ') || 'none'}`, `Files: ${this.twin.files.length}`, `Symbols: ${count('symbol')}`, `Components: ${count('component')}`, `Endpoints: ${count('endpoint')}`, `Database models: ${count('database_model')}`, `Relations: ${this.twin.relations.length}`].join('\n');
  }
  private related(id: string, type: RelationType, side: 'sourceId' | 'targetId'): readonly StructuralEntity[] {
    const ids = this.twin.relations.filter((relation) => relation.type === type && relation[side] === id).map((relation) => side === 'sourceId' ? relation.targetId : relation.sourceId);
    return this.twin.entities.filter((entity) => ids.includes(entity.id));
  }
}
