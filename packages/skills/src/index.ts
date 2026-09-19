import { readFile, stat } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

export interface SkillMeta {
  readonly name: string;
  readonly description: string;
  readonly path: string;
}

export interface SkillsEngineOptions {
  readonly projectRoot: string;
  readonly projectDirectories?: readonly string[];
  readonly globalDirectory?: string;
  readonly enabledSkills?: readonly string[];
}

/** Discovers local Markdown skills and loads full content only on demand. */
export class SkillsEngine {
  private readonly projectRoot: string;
  private readonly directories: readonly string[];
  private readonly enabledSkills: ReadonlySet<string>;

  constructor(options: SkillsEngineOptions) {
    this.projectRoot = resolve(options.projectRoot);
    this.enabledSkills = new Set(options.enabledSkills ?? []);
    const projectDirectories = options.projectDirectories ?? ['.sentinel/skills'];
    this.directories = [
      options.globalDirectory ?? join(homedir(), 'sentinel', 'skills'),
      ...projectDirectories.map((directory) => isAbsolute(directory) ? directory : join(this.projectRoot, directory)),
    ];
  }

  listAvailable(): SkillMeta[] {
    const byName = new Map<string, SkillMeta>();
    for (const directory of this.directories) {
      for (const file of listMarkdownFiles(directory)) {
        const meta = parseSkillMeta(file);
        if (meta) byName.set(meta.name, meta);
      }
    }
    const skills = [...byName.values()];
    if (this.enabledSkills.size === 0) return skills.sort((left, right) => left.name.localeCompare(right.name));
    return skills.filter((skill) => this.enabledSkills.has(skill.name)).sort((left, right) => left.name.localeCompare(right.name));
  }

  async load(name: string): Promise<string> {
    const meta = this.listAvailable().find((skill) => skill.name === name);
    if (!meta) throw new Error(`Skill "${name}" was not found.`);
    const resolved = resolve(meta.path);
    if (!this.isAllowedPath(resolved)) throw new Error(`Skill "${name}" is outside the configured skill directories.`);
    const fileStat = await stat(resolved);
    if (fileStat.size > 512_000) throw new Error(`Skill "${name}" exceeds the 512 KiB limit.`);
    return readFile(resolved, 'utf8');
  }

  async prepareContext(query: string): Promise<string> {
    const available = this.listAvailable();
    if (available.length === 0) return '';
    const descriptions = available.map((skill) => `- ${skill.name}: ${skill.description}`);
    const relevant = available.filter((skill) => isRelevant(query, skill));
    const loaded = await Promise.all(relevant.map(async (skill) => {
      try { return `### Skill: ${skill.name}\n${await this.load(skill.name)}`; } catch { return ''; }
    }));
    return [
      'Available Sentinel skills (descriptions only by default):',
      ...descriptions,
      ...loaded.filter((content) => content.length > 0),
    ].join('\n');
  }

  private isAllowedPath(candidate: string): boolean {
    return this.directories.some((directory) => {
      const rel = relative(resolve(directory), candidate);
      return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    });
  }
}

function listMarkdownFiles(directory: string): string[] {
  const files: string[] = [];
  const visit = (current: string): void => {
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const file = join(current, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(file);
    }
  };
  visit(directory);
  return files;
}

function parseSkillMeta(filePath: string): SkillMeta | undefined {
  let content: string;
  try { content = readFileSync(filePath, 'utf8'); } catch { return undefined; }
  if (!content.startsWith('---')) return undefined;
  const end = content.indexOf('\n---', 3);
  if (end < 0) return undefined;
  const frontmatter = content.slice(3, end).split(/\r?\n/);
  const values = new Map<string, string>();
  for (const line of frontmatter) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    values.set(key, value);
  }
  const name = values.get('name');
  const description = values.get('description');
  return name && description ? { name, description, path: filePath } : undefined;
}

function isRelevant(query: string, skill: SkillMeta): boolean {
  const haystack = `${skill.name} ${skill.description}`.toLowerCase();
  return query.toLowerCase().split(/\W+/).some((token) => token.length > 2 && haystack.includes(token));
}
