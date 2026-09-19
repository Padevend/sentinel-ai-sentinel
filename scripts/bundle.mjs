#!/usr/bin/env node

/**
 * Sentinel Production Bundle Script
 *
 * Bundles Sentinel CLI and all workspace packages into a single production ESM distribution.
 */

import { chmodSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rootDir = resolve('.');

let esbuild;
try {
  esbuild = await import('esbuild');
} catch {
  // Find esbuild in .pnpm directory
  try {
    const pnpmDir = join(rootDir, 'node_modules', '.pnpm');
    const entries = readdirSync(pnpmDir);
    const esbuildEntry = entries.find((e) => e.startsWith('esbuild@'));
    if (esbuildEntry) {
      esbuild = require(join(pnpmDir, esbuildEntry, 'node_modules', 'esbuild', 'lib', 'main.js'));
    }
  } catch (err) {
    console.error('Failed to locate esbuild:', err);
    process.exit(1);
  }
}

const outDir = join(rootDir, 'dist');
mkdirSync(outDir, { recursive: true });

async function bundle() {
  console.log('Bundling Sentinel for production (ESM)...');

  const buildFn = esbuild.build || esbuild.default?.build;
  if (!buildFn) {
    throw new Error('esbuild build function not found');
  }

  await buildFn({
    entryPoints: [join(rootDir, 'apps/cli/src/index.tsx')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: join(outDir, 'sentinel.mjs'),
    banner: {
      js: [
        'import { createRequire as _topCreateRequire } from "node:module";',
        'const require = _topCreateRequire(import.meta.url);',
      ].join('\n'),
    },
    minify: true,
    sourcemap: true,
    external: [
      'fsevents',
      'ink',
      'ink-text-input',
      'ink-spinner',
      'yoga-layout',
      'react',
      'react/*',
      'chalk',
      'typescript',
    ],
    plugins: [
      {
        name: 'better-sqlite3-shim',
        setup(build) {
          build.onResolve({ filter: /^better-sqlite3$/ }, () => ({
            path: 'better-sqlite3',
            namespace: 'better-sqlite3-shim',
          }));
          build.onLoad({ filter: /.*/, namespace: 'better-sqlite3-shim' }, () => ({
            contents: `
              import { createRequire } from 'node:module';
              import { join, resolve } from 'node:path';
              const req = createRequire(import.meta.url);
              let Database;
              try {
                Database = req('better-sqlite3');
              } catch {
                try {
                  Database = req(resolve('./node_modules/better-sqlite3'));
                } catch {
                  try {
                    Database = req(resolve('./packages/storage/node_modules/better-sqlite3'));
                  } catch (e) {
                    Database = class {
                      constructor() { throw new Error('better-sqlite3 is required: ' + e.message); }
                    };
                  }
                }
              }
              export default Database;
            `,
            loader: 'js',
          }));
        },
      },
      {
        name: 'react-devtools-core-stub',
        setup(build) {
          build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
            path: 'react-devtools-core',
            namespace: 'react-devtools-stub',
          }));
          build.onLoad({ filter: /.*/, namespace: 'react-devtools-stub' }, () => ({
            contents: 'export default {}; export const connectToDevTools = () => {};',
            loader: 'js',
          }));
        },
      },
    ],
    loader: {
      '.ts': 'ts',
      '.tsx': 'tsx',
    },
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  });

  try {
    chmodSync(join(outDir, 'sentinel.mjs'), 0o755);
  } catch {
    // Windows ignore
  }
  console.log('Successfully created dist/sentinel.mjs');
}

bundle().catch((err) => {
  console.error('Bundle failed:', err);
  process.exit(1);
});
