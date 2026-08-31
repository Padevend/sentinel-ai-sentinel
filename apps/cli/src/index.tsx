#!/usr/bin/env node

/**
 * Sentinel CLI Entry Point — Phase 3 Product Runtime
 *
 * Handles CLI flags (--version, --help, doctor, --self-test, --continue, --resume),
 * project root detection, project identity, persistent session recovery,
 * and first-launch setup wizard.
 */

import React, { useState, useEffect } from 'react';
import { render, Box, Text } from 'ink';
import { join } from 'node:path';
import {
  loadConfig,
  isFirstLaunch,
  DoctorEngine,
  SelfTestRunner,
  getPlatformService,
  type ResolvedConfig,
  type SessionSummary,
} from '@sentinel/core';
import { createProvider } from '@sentinel/llm';
import { createDefaultToolRegistry } from '@sentinel/tools';
import { PermissionManager } from '@sentinel/permissions';
import { ProjectDetector, ProjectIdentityService, ProjectIndexer } from '@sentinel/project';
import { ContextEngine } from '@sentinel/context';
import { MemoryEngine } from '@sentinel/memory';
import { SQLiteRepositories, SQLiteStorageAdapter } from '@sentinel/storage';
import { AgentKernel, AgentSession, SessionManager } from '@sentinel/agent';
import { App } from './App.js';
import { SetupWizard } from './components/SetupWizard.js';
import { SessionResumeSelector } from './components/SessionResumeSelector.js';

const VERSION = '0.1.0';

interface LauncherState {
  mode: 'setup' | 'resume_select' | 'app' | 'loading';
  resumableSessions?: SessionSummary[];
  activeSession?: AgentSession;
  resumeNotice?: string;
  runtime?: {
    resolvedConfig: ResolvedConfig;
    projectInfo: any;
    kernel: AgentKernel;
    session: AgentSession;
    sessionManager: SessionManager;
    providerName: string;
    modelId: string;
  };
}

interface RootLauncherProps {
  projectRootPath: string;
  cliFlags: {
    continueSession?: boolean;
    resumeSessionId?: string;
    resumeSelect?: boolean;
  };
}

const RootLauncher: React.FC<RootLauncherProps> = ({ projectRootPath, cliFlags }) => {
  const [state, setState] = useState<LauncherState>({ mode: 'loading' });
  const [projectName, setProjectName] = useState<string>('project');

  useEffect(() => {
    initRuntime().catch((err) => {
      console.error('Failed to initialize Sentinel runtime:', err);
      process.exit(1);
    });
  }, []);

  const initRuntime = async () => {
    // 1. Ensure runtime directories exist
    const platform = getPlatformService();
    await platform.ensureDirectories();

    // 2. Resolve Project Identity
    const projectIdentity = await ProjectIdentityService.resolveIdentity(projectRootPath);
    setProjectName(projectIdentity.name);

    // 3. Initialize SQLite Repositories
    const dbPath = join(platform.getPaths().dataDir, 'sentinel.db');
    const repos = new SQLiteRepositories(dbPath);
    await repos.projects.save(projectIdentity);

    const sessionManager = new SessionManager(repos.sessions);

    // 4. Check if first launch setup is needed
    const needsSetup = await isFirstLaunch();
    if (needsSetup) {
      setState({ mode: 'setup' });
      return;
    }

    // 5. Handle --continue or --resume flags
    if (cliFlags.continueSession) {
      const latest = await sessionManager.getLatestResumableSession(projectIdentity.id);
      if (latest) {
        const consistency = await sessionManager.checkConsistency(latest, projectRootPath);
        const notice = consistency.warning
          ? `⚠ Notice: ${consistency.warning}`
          : `✓ Resuming previous session: "${latest.taskSummary || latest.id}"`;
        await bootApp(latest, sessionManager, repos, notice);
        return;
      }
    }

    if (cliFlags.resumeSessionId) {
      const target = await sessionManager.loadSession(cliFlags.resumeSessionId as any);
      if (target) {
        const consistency = await sessionManager.checkConsistency(target, projectRootPath);
        const notice = consistency.warning
          ? `⚠ Notice: ${consistency.warning}`
          : `✓ Resumed session ID: ${target.id}`;
        await bootApp(target, sessionManager, repos, notice);
        return;
      }
    }

    if (cliFlags.resumeSelect) {
      const sessions = await sessionManager.listSessionsForProject(projectIdentity.id);
      if (sessions.length > 0) {
        setState({
          mode: 'resume_select',
          resumableSessions: sessions,
        });
        return;
      }
    }

    // Default: Start fresh session
    const resolvedConfig = await loadConfig(projectRootPath);
    const newSession = await sessionManager.createSession({
      projectId: projectIdentity.id,
      modelId: resolvedConfig.config.model.model,
      providerName: resolvedConfig.config.model.provider,
    });
    await bootApp(newSession, sessionManager, repos);
  };

  const bootApp = async (
    session: AgentSession,
    sessionManager: SessionManager,
    repos: SQLiteRepositories,
    resumeNotice?: string,
  ) => {
    const resolvedConfig = await loadConfig(projectRootPath);

    // Storage adapter for indexer
    const storage = new SQLiteStorageAdapter(join(getPlatformService().getPaths().dataDir, 'sentinel.db'));
    const indexer = new ProjectIndexer(projectRootPath, storage);
    const scanResult = await indexer.scan();

    const contextEngine = new ContextEngine(
      scanResult.info,
      scanResult.files,
      scanResult.symbols,
    );

    const memoryEngine = new MemoryEngine(session.id, storage);
    const tools = createDefaultToolRegistry();
    const permissions = new PermissionManager(resolvedConfig.config.permissions);
    const provider = createProvider(resolvedConfig);

    const kernel = new AgentKernel({
      projectRoot: projectRootPath,
      provider,
      tools,
      permissions,
      contextEngine,
      memoryEngine,
      maxIterations: resolvedConfig.config.agent.maxIterations,
    });

    setState({
      mode: 'app',
      resumeNotice,
      runtime: {
        resolvedConfig,
        projectInfo: scanResult.info,
        kernel,
        session,
        sessionManager,
        providerName: provider.name,
        modelId: provider.modelId,
      },
    });
  };

  if (state.mode === 'loading') {
    return (
      <Box padding={1}>
        <Text color="cyan">Starting Sentinel runtime...</Text>
      </Box>
    );
  }

  if (state.mode === 'setup') {
    return (
      <SetupWizard
        onComplete={async () => {
          await initRuntime();
        }}
      />
    );
  }

  if (state.mode === 'resume_select' && state.resumableSessions) {
    return (
      <SessionResumeSelector
        sessions={state.resumableSessions}
        projectName={projectName}
        onSelect={async (selectedSummary) => {
          const platform = getPlatformService();
          const dbPath = join(platform.getPaths().dataDir, 'sentinel.db');
          const repos = new SQLiteRepositories(dbPath);
          const sessionManager = new SessionManager(repos.sessions);
          const loaded = await sessionManager.loadSession(selectedSummary.id);
          if (loaded) {
            await bootApp(loaded, sessionManager, repos, `✓ Resumed session: ${loaded.taskSummary || loaded.id}`);
          }
        }}
        onCancel={async () => {
          const platform = getPlatformService();
          const dbPath = join(platform.getPaths().dataDir, 'sentinel.db');
          const repos = new SQLiteRepositories(dbPath);
          const sessionManager = new SessionManager(repos.sessions);
          const projectIdentity = await ProjectIdentityService.resolveIdentity(projectRootPath);
          const resolvedConfig = await loadConfig(projectRootPath);
          const newSession = await sessionManager.createSession({
            projectId: projectIdentity.id,
            modelId: resolvedConfig.config.model.model,
            providerName: resolvedConfig.config.model.provider,
          });
          await bootApp(newSession, sessionManager, repos);
        }}
      />
    );
  }

  if (state.mode === 'app' && state.runtime) {
    return (
      <App
        projectInfo={state.runtime.projectInfo}
        kernel={state.runtime.kernel}
        session={state.runtime.session}
        sessionManager={state.runtime.sessionManager}
        resolvedConfig={state.runtime.resolvedConfig}
        initialProviderName={state.runtime.providerName}
        initialModelId={state.runtime.modelId}
        initialMessage={state.resumeNotice}
      />
    );
  }

  return null;
};

// ─── CLI Entry Point ─────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // 1. --version / -v
  if (args.includes('--version') || args.includes('-v')) {
    const osInfo = getPlatformService().getOSInfo();
    console.log(`Sentinel v${VERSION} (${osInfo.platform}-${osInfo.arch})`);
    process.exit(0);
  }

  // 2. --help / -h
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🛡️  Sentinel — AI Software Engineering Agent (v${VERSION})

USAGE:
  sentinel [OPTIONS]

OPTIONS:
  -c, --continue        Automatically resume the latest active or interrupted session
  -r, --resume [ID]     Interactively select and resume a session, or resume specific ID
  doctor                Run system diagnostics and verify environment health
  --self-test           Perform an automated non-destructive self-test of all subsystems
  -v, --version         Show Sentinel version and platform information
  -h, --help            Show this help manual

INTERACTIVE COMMANDS:
  /model                Select or change active LLM model
  /reset                Reset configuration to defaults and wipe settings
  /status               Show project tech stack, file count & git status
  /permissions          Show active tool permission levels & safety rules
  /clear                Clear session history
  /exit, /quit          Exit Sentinel
`);
    process.exit(0);
  }

  // 3. doctor
  if (args.includes('doctor')) {
    const projectRoot = (await ProjectDetector.detectRoot(process.cwd())).path;
    const report = await DoctorEngine.diagnose(projectRoot);
    console.log(DoctorEngine.formatReport(report));
    process.exit(report.hasErrors ? 1 : 0);
  }

  // 4. --self-test
  if (args.includes('--self-test')) {
    const result = await SelfTestRunner.run();
    console.log(result.output);
    process.exit(result.success ? 0 : 1);
  }

  // 5. Parse session flags
  const continueSession = args.includes('--continue') || args.includes('-c');
  const resumeIdx = args.findIndex((a) => a === '--resume' || a === '-r');
  let resumeSessionId: string | undefined;
  let resumeSelect = false;

  if (resumeIdx !== -1) {
    const nextArg = args[resumeIdx + 1];
    if (nextArg && !nextArg.startsWith('-')) {
      resumeSessionId = nextArg;
    } else {
      resumeSelect = true;
    }
  }

  // 6. Detect project root
  const detected = await ProjectDetector.detectRoot(process.cwd());

  const app = render(
    React.createElement(RootLauncher, {
      projectRootPath: detected.path,
      cliFlags: {
        continueSession,
        resumeSessionId,
        resumeSelect,
      },
    }),
  );

  await app.waitUntilExit();
}

main().catch((err) => {
  console.error('Sentinel fatal error:', err);
  process.exit(1);
});
