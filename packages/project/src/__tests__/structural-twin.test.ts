import { describe, expect, it, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectIndexer, StructuralTwinQuery } from '../index.js';

describe('Structural Twin', () => {
  let root = '';
  afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

  it('builds traced entities and relations from a full-stack fixture', async () => {
    root = await mkdtemp(join(tmpdir(), 'sentinel-twin-'));
    await mkdir(join(root, 'src'), { recursive: true });
    await mkdir(join(root, 'prisma'), { recursive: true });
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture', dependencies: { express: '^1', react: '^1', prisma: '^1' }, scripts: { test: 'vitest' } }));
    await writeFile(join(root, 'src', 'service.ts'), 'export function createEvent() { return true; }');
    await writeFile(join(root, 'src', 'controller.ts'), "import { createEvent } from './service';\nexport function handleCreate() { return createEvent(); }\napp.post('/events', handleCreate);");
    await writeFile(join(root, 'src', 'event.test.ts'), "import { createEvent } from './service';\ntest('event', () => createEvent());");
    await writeFile(join(root, 'src', 'page.tsx'), 'export function EventPage() { return <EventForm />; }\nexport function EventForm() { return null; }');
    await writeFile(join(root, 'prisma', 'schema.prisma'), 'model Event {\n  id String @id\n}');

    const scan = await new ProjectIndexer(root).scan();
    const twin = scan.twin;
    expect(twin).toBeDefined();
    expect(twin?.entities.some((entity) => entity.name === 'POST /events' && entity.kind === 'endpoint')).toBe(true);
    expect(twin?.entities.some((entity) => entity.name === 'Event' && entity.kind === 'database_model')).toBe(true);
    expect(twin?.entities.some((entity) => entity.name === 'EventPage' && entity.kind === 'component')).toBe(true);

    const query = new StructuralTwinQuery(twin!);
    const service = query.findSymbol('createEvent').find((entity) => entity.source?.file.endsWith('service.ts'));
    expect(service).toBeDefined();
    expect(query.findCallers(service!.id).some((entity) => entity.name === 'handleCreate')).toBe(true);
    expect(query.findTestsFor(service!.id).some((entity) => entity.name.endsWith('event.test.ts'))).toBe(true);
  });
});
