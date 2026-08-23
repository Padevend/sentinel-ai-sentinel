#!/usr/bin/env node

/**
 * Sentinel CLI Entry Point
 *
 * Starts the interactive persistent developer session.
 * Displays first-launch setup wizard if no settings exist.
 */

import React, { useState } from 'react';
import { render, Box } from 'ink';
import { resolve } from 'node:path';
import { loadConfig, isFirstLaunch, type ResolvedConfig } from '@sentinel/core';
import { createProvider } from '@sentinel/llm';
import { createDefaultToolRegistry } from '@sentinel/tools';
import { PermissionManager } from '@sentinel/permissions';
import { ProjectIndexer } from '@sentinel/project';
import { ContextEngine } from '@sentinel/context';
import { MemoryEngine } from '@sentinel/memory';
import { InMemoryStorageAdapter } from '@sentinel/storage';
import { AgentKernel, AgentSession } from '@sentinel/agent';
import { App } from './App.js';
import { SetupWizard } from './components/SetupWizard.js';

interface RootLauncherProps {
  projectRoot: string;
  initialFirstLaunch: boolean;
}

const RootLauncher: React.FC<RootLauncherProps> = ({ projectRoot, initialFirstLaunch }) => {
  const [inSetup, setInSetup] = useState(initialFirstLaunch);
  const [runtimeState, setRuntimeState] = useState<{
    resolvedConfig: ResolvedConfig;
    projectInfo: any;
    kernel: AgentKernel;
    session: AgentSession;
    providerName: string;
    modelId: string;
  } | null>(null);

  const startSession = async () => {
    // 1. Load config & environment
    const resolvedConfig = await loadConfig(projectRoot);

    // 2. Storage & Project Indexing
    const storage = new InMemoryStorageAdapter();
    const indexer = new ProjectIndexer(projectRoot, storage);
    const scanResult = await indexer.scan();

    // 3. Context & Memory Engines
    const contextEngine = new ContextEngine(
      scanResult.info,
      scanResult.files,
      scanResult.symbols,
    );

    const memoryEngine = new MemoryEngine('session-default' as any, storage);

    // 4. Tools & Permissions
    const tools = createDefaultToolRegistry();
    const permissions = new PermissionManager(resolvedConfig.config.permissions);

    // 5. LLM Provider
    const provider = createProvider(resolvedConfig);

    // 6. Agent Kernel & Session
    const kernel = new AgentKernel({
      projectRoot,
      provider,
      tools,
      permissions,
      contextEngine,
      memoryEngine,
      maxIterations: resolvedConfig.config.agent.maxIterations,
    });

    const session = new AgentSession('session-main' as any, memoryEngine);

    setRuntimeState({
      resolvedConfig,
      projectInfo: scanResult.info,
      kernel,
      session,
      providerName: provider.name,
      modelId: provider.modelId,
    });
    setInSetup(false);
  };

  React.useEffect(() => {
    if (!initialFirstLaunch) {
      startSession().catch((err) => {
        console.error('Failed to initialize Sentinel:', err);
        process.exit(1);
      });
    }
  }, []);

  if (inSetup) {
    return (
      <SetupWizard
        onComplete={async () => {
          await startSession();
        }}
      />
    );
  }

  if (!runtimeState) {
    return null;
  }

  return (
    <App
      projectInfo={runtimeState.projectInfo}
      kernel={runtimeState.kernel}
      session={runtimeState.session}
      resolvedConfig={runtimeState.resolvedConfig}
      initialProviderName={runtimeState.providerName}
      initialModelId={runtimeState.modelId}
    />
  );
};

async function main() {
  const projectRoot = resolve(process.cwd());
  const needsSetup = await isFirstLaunch();

  const app = render(
    React.createElement(RootLauncher, {
      projectRoot,
      initialFirstLaunch: needsSetup,
    }),
  );

  await app.waitUntilExit();
}

main().catch((err) => {
  console.error('Sentinel fatal error:', err);
  process.exit(1);
});
