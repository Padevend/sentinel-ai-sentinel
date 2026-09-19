import type { StructuralEntity, StructuralRelation } from './types.js';
import { StructuralTwinQuery } from './structural-twin.js';

export interface PreAnalysisResult {
  readonly query: string;
  readonly relevantFiles: readonly string[];
  readonly relevantEntities: readonly StructuralEntity[];
  readonly relevantRelations: readonly StructuralRelation[];
  readonly formatted: string;
  readonly estimatedTokens: number;
  readonly exploratoryReadsAvoided: number;
}

/** Deterministically selects a small symbol subgraph before any model call. */
export class StaticPreAnalyzer {
  constructor(private readonly twin: StructuralTwinQuery) {}

  analyze(query: string, limit = 24): PreAnalysisResult {
    const normalizedTokens = query.toLowerCase().split(/[^a-z0-9_$-]+/).filter((token) => token.length > 1);
    const snapshot = this.twin.getSnapshot();
    const relevantEntities = snapshot.entities
      .map((entity) => ({ entity, score: entityScore(entity, normalizedTokens) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.entity.id.localeCompare(right.entity.id))
      .slice(0, limit)
      .map((item) => item.entity);
    const ids = new Set(relevantEntities.map((entity) => entity.id));
    const relevantRelations = snapshot.relations.filter((relation) => ids.has(relation.sourceId) || ids.has(relation.targetId));
    const relevantFiles = [...new Set(relevantEntities
      .map((entity) => entity.source?.file)
      .filter((file): file is string => file !== undefined))];
    const formatted = formatResult(query, relevantFiles, relevantEntities, relevantRelations);
    return {
      query,
      relevantFiles,
      relevantEntities,
      relevantRelations,
      formatted,
      estimatedTokens: Math.ceil(formatted.length / 4),
      exploratoryReadsAvoided: relevantFiles.length,
    };
  }
}

function entityScore(entity: StructuralEntity, tokens: readonly string[]): number {
  const haystack = `${entity.name} ${entity.kind} ${entity.source?.file ?? ''}`.toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

function formatResult(
  query: string,
  files: readonly string[],
  entities: readonly StructuralEntity[],
  relations: readonly StructuralRelation[],
): string {
  const lines = [
    `Static pre-analysis for: ${query}`,
    `Relevant files (${files.length}): ${files.join(', ') || 'none'}`,
    'Relevant symbols/entities:',
    ...entities.map((entity) => `- ${entity.status} ${entity.kind} ${entity.name} (${entity.source?.file ?? 'unknown'}:${entity.source?.startLine ?? 0})`),
    'Relevant relations:',
    ...relations.map((relation) => `- ${relation.status} ${relation.type} ${relation.sourceId} -> ${relation.targetId} (confidence ${relation.confidence})`),
  ];
  return lines.join('\n');
}
