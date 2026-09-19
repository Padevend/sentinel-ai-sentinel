/**
 * @sentinel/cli — Root Application Component
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp } from 'ink';
import type {
  ProjectInfo,
  ResolvedConfig,
  ModelResponseChunkEvent,
  ToolStartedEvent,
  ToolCompletedEvent,
} from '@sentinel/core';
import { loadSettings, saveSettings, updateSettings, resetSettings } from '@sentinel/core';
import { createProvider } from '@sentinel/llm';
import type { LLMProvider, ModelDiscovery, ReasoningEffort } from '@sentinel/llm';
import type { FileContextEngine } from '@sentinel/context';
import type { AgentKernel, AgentSession, SessionManager } from '@sentinel/agent';
import type { PermissionCheck, PermissionManager, PermissionOverride, PermissionPolicy } from '@sentinel/permissions';
import { Header } from './components/Header.js';
import { MessageList, type DisplayMessage } from './components/MessageList.js';
import { ToolActivity, type ActivityItem } from './components/ToolActivity.js';
import { InputPrompt } from './components/InputPrompt.js';
import { ConfirmationPrompt } from './components/ConfirmationPrompt.js';
import { ModelSelector } from './components/ModelSelector.js';
import { PermissionPanel } from './components/PermissionPanel.js';
import { ReasoningSelector } from './components/ReasoningSelector.js';
import { ResumeConfirmation } from './components/ResumeConfirmation.js';
import { parseSlashCommand } from './commands.js';

interface AppProps {
  projectInfo: ProjectInfo;
  kernel: AgentKernel;
  permissions: PermissionManager;
  session: AgentSession;
  sessionManager?: SessionManager;
  resolvedConfig: ResolvedConfig;
  initialProviderName: string;
  initialModelId: string;
  provider: LLMProvider;
  modelDiscovery: ModelDiscovery;
  fileContextEngine: FileContextEngine;
  initialMessage?: string;
}

export const App: React.FC<AppProps> = ({
  projectInfo,
  kernel,
  permissions,
  session,
  sessionManager,
  resolvedConfig,
  initialProviderName,
  initialModelId,
  provider,
  modelDiscovery,
  fileContextEngine,
  initialMessage,
}) => {
  const { exit } = useApp();
  const [messages, setMessages] = useState<DisplayMessage[]>(() => {
    const list: DisplayMessage[] = [];
    if (initialMessage) {
      list.push({
        id: `init-${Date.now()}`,
        role: 'system',
        content: initialMessage,
      });
    }
    // Load historical messages from resumed session if any
    for (const msg of session.getMessages()) {
      list.push({
        id: `hist-${msg.timestamp.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
        role: msg.role === 'tool' ? 'system' : msg.role,
        content: msg.content,
      });
    }
    return list;
  });

  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [streamingChunk, setStreamingChunk] = useState<string>('');
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [providerName, setProviderName] = useState<string>(initialProviderName);
  const [activeProvider, setActiveProvider] = useState<LLMProvider>(provider);
  const [currentModelId, setCurrentModelId] = useState<string>(initialModelId);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort | undefined>(resolvedConfig.config.model.reasoningEffort);
  const [permissionPolicy, setPermissionPolicy] = useState<PermissionPolicy>(() => permissions.getPolicy());
  const [mode, setMode] = useState<'chat' | 'model_select' | 'permissions' | 'reasoning_select'>('chat');
  const [resumeApproved, setResumeApproved] = useState<boolean>(session.status !== 'interrupted');
  const [pendingCheck, setPendingCheck] = useState<{
    check: PermissionCheck;
    resolve: (approved: boolean) => void;
  } | null>(null);

  const closeSession = useCallback(async (status: 'completed' | 'cancelled'): Promise<void> => {
    if (isBusy) kernel.cancel(session.id);
    session.setStatus(status);
    if (sessionManager) await sessionManager.saveSession(session);
    exit();
  }, [exit, isBusy, kernel, session.id, sessionManager]);

  useEffect(() => {
    kernel.setConfirmationHandler((check: any) => new Promise<boolean>((resolve) => {
      setPendingCheck({ check, resolve });
    }));
    return () => kernel.setConfirmationHandler(null);
  }, [kernel]);

  useEffect(() => {
    const handleInterrupt = (): void => {
      if (isBusy) {
        kernel.cancel(session.id);
        return;
      }
      void closeSession('completed');
    };
    process.on('SIGINT', handleInterrupt);
    return () => { process.off('SIGINT', handleInterrupt); };
  }, [closeSession, isBusy, kernel, session.id]);

  useEffect(() => () => fileContextEngine.close(), [fileContextEngine]);


  // Subscribe to agent events
  useEffect(() => {
    const unsubChunk = kernel.eventBus.on('model_response_chunk', (e: ModelResponseChunkEvent) => {
      setStreamingChunk((prev) => prev + e.content);
    });

    const unsubToolStart = kernel.eventBus.on('tool_started', (e: ToolStartedEvent) => {
      // Record modified files if tool wrote or patched
      if (['write_file', 'patch_file'].includes(e.toolName)) {
        const inputObj = e.input as Record<string, unknown>;
        if (typeof inputObj?.['filePath'] === 'string') {
          session.recordModifiedFile(inputObj['filePath']);
        }
      }

      setActivities((prev) => [
        ...prev,
        {
          id: e.toolCallId,
          type: 'pending',
          message: `Executing ${e.toolName}...`,
        },
      ]);
    });

    const unsubToolEnd = kernel.eventBus.on('tool_completed', (e: ToolCompletedEvent) => {
      setActivities((prev) =>
        prev.map((act) =>
          act.id === e.toolCallId
            ? {
              ...act,
              type: e.result.success ? 'success' : 'failure',
              message: `${e.toolName}: ${e.result.output.slice(0, 100).replace(/\n/g, ' ')}`,
            }
            : act,
        ),
      );
    });

    return () => {
      unsubChunk();
      unsubToolStart();
      unsubToolEnd();
    };
  }, [kernel, session]);

  const handleModelChange = async (newModelId: string) => {
    setMode('chat');
    if (newModelId === currentModelId) return;

    try {
      // 1. Update settings.json
      await updateSettings({
        model: {
          provider: resolvedConfig.config.model.provider,
          modelId: newModelId,
          baseUrl: resolvedConfig.config.model.baseUrl,
          apiKey: resolvedConfig.secrets.apiKey,
        },
      });

      // 2. Reconfigure kernel provider with new model
      const updatedResolvedConfig: ResolvedConfig = {
        ...resolvedConfig,
        config: {
          ...resolvedConfig.config,
          model: {
            ...resolvedConfig.config.model,
            model: newModelId,
            modelId: newModelId,
          },
        },
      };
      const newProvider = createProvider(updatedResolvedConfig);
      kernel.setProvider(newProvider);
      setActiveProvider(newProvider);

      setCurrentModelId(newModelId);
      setProviderName(newProvider.name);
      session.modelId = newModelId;
      session.providerName = newProvider.name;

      if (sessionManager) {
        await sessionManager.saveSession(session);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: 'system',
          content: `✓ Active model switched to: ${newModelId} (${newProvider.name})`,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'system',
          content: `Failed to switch model: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    }
  };

  const handleReasoningChange = async (effort: ReasoningEffort | undefined): Promise<void> => {
    setMode('chat');
    kernel.setReasoningEffort(effort);
    setReasoningEffort(effort);

    try {
      const existing = await loadSettings();
      if (effort) {
        await updateSettings({
          model: {
            provider: resolvedConfig.config.model.provider,
            modelId: currentModelId || undefined,
            reasoningEffort: effort,
          },
        });
      } else if (existing) {
        const model = { ...existing.model };
        delete model.reasoningEffort;
        await saveSettings({ ...existing, model });
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: 'system',
          content: `✓ Reasoning effort: ${effort ?? 'auto'} (appliqué pour les prochains tours)`,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'system',
          content: `Impossible d'enregistrer le mode de raisonnement: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    }
  };

  const handlePermissionApply = async (update: {
    defaultLevel: PermissionPolicy['defaultLevel'];
    overrides: readonly PermissionOverride[];
    persist: boolean;
  }): Promise<void> => {
    permissions.updatePolicy({
      defaultLevel: update.defaultLevel,
      overrides: update.overrides,
    });
    permissions.clearSessionOverrides();
    const nextPolicy = permissions.getPolicy();
    setPermissionPolicy(nextPolicy);
    setMode('chat');

    try {
      if (update.persist) {
        await updateSettings({
          permissions: {
            defaultLevel: update.defaultLevel,
            overrides: update.overrides.map((override) => ({ ...override })),
          },
        });
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: 'system',
          content: update.persist
            ? '✓ Permissions appliquées et enregistrées dans la configuration globale.'
            : '✓ Permissions appliquées pour cette session.',
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'system',
          content: `Permissions appliquées en session, mais non enregistrées: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    }
  };

  const handleReset = async () => {
    try {
      await resetSettings();
      session.clear();
      await closeSession('cancelled');
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'system',
          content: `Failed to reset settings: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    }
  };

  const handleResumeDecision = async (approved: boolean): Promise<void> => {
    if (approved) {
      session.setStatus('active');
      setResumeApproved(true);
      if (sessionManager) await sessionManager.saveSession(session);
      return;
    }

    session.setStatus('paused');
    if (sessionManager) await sessionManager.saveSession(session);
    exit();
  };

  const handleUserInput = async (input: string) => {
    // 1. Handle Slash Commands
    const action = parseSlashCommand(input, {
      projectInfo,
      modelId: currentModelId,
      providerName,
      clearMessages: () => {
        setMessages([]);
        session.clear();
        if (sessionManager) void sessionManager.saveSession(session);
      },
      exitApp: () => { void closeSession('completed'); },
      openModelSelector: () => setMode('model_select'),
      resetConfig: handleReset,
    });

    if (action !== null) {
      if (action.type === 'open_model_selector') {
        setMode('model_select');
        return;
      }

      if (action.type === 'open_permissions') {
        setPermissionPolicy(permissions.getPolicy());
        setMode('permissions');
        return;
      }

      if (action.type === 'open_reasoning_selector') {
        setMode('reasoning_select');
        return;
      }

      if (action.type === 'reset') {
        await handleReset();
        return;
      }

      if (action.type === 'exit') {
        await closeSession('completed');
        return;
      }

      if (action.type === 'message') {
        setMessages((prev) => [
          ...prev,
          { id: `user-${Date.now()}`, role: 'user', content: input },
          { id: `sys-${Date.now()}`, role: 'system', content: action.message },
        ]);
        return;
      }
    }

    // 2. Normal prompt turn
    const userMsgId = `user-${Date.now()}`;
    setMessages((prev) => [...prev, { id: userMsgId, role: 'user', content: input }]);
    setIsBusy(true);
    setStreamingChunk('');

    try {
      if (!session.taskSummary) {
        session.setTaskSummary(input.slice(0, 80));
      }

      const result = await kernel.run(input, session, { autoVerify: true, stream: true });
      const assistantMsgId = `asst-${Date.now()}`;

      // Checkpoint step
      session.createCheckpoint(`Completed step: ${input.slice(0, 50)}`);

      // Persist session to SQLite
      if (sessionManager) {
        await sessionManager.saveSession(session);
      }

      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: 'assistant', content: result.finalResponse },
      ]);
    } catch (err) {
      session.setStatus('interrupted');
      if (sessionManager) {
        await sessionManager.saveSession(session);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'system',
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setIsBusy(false);
      setStreamingChunk('');
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Header projectInfo={projectInfo} modelName={`${currentModelId || 'model not selected'} (${providerName || 'provider not selected'})`} reasoningEffort={reasoningEffort} />

      {!resumeApproved ? (
        <ResumeConfirmation
          sessionId={session.id}
          warning={initialMessage}
          onDecision={handleResumeDecision}
        />
      ) : mode === 'model_select' ? (
        <ModelSelector
          providerName={providerName}
          provider={activeProvider}
          discovery={modelDiscovery}
          currentModelId={currentModelId}
          onSelect={handleModelChange}
          onCancel={() => setMode('chat')}
        />
      ) : mode === 'permissions' ? (
        <PermissionPanel
          policy={permissionPolicy}
          onApply={handlePermissionApply}
          onCancel={() => setMode('chat')}
        />
      ) : mode === 'reasoning_select' ? (
        <ReasoningSelector
          current={reasoningEffort}
          onSelect={handleReasoningChange}
          onCancel={() => setMode('chat')}
        />
      ) : (
        <>
          <MessageList messages={messages} streamingContent={streamingChunk} />
          <ToolActivity activities={activities} />

          {pendingCheck ? (
            <ConfirmationPrompt
              check={pendingCheck.check}
              onConfirm={(approved) => {
                pendingCheck.resolve(approved);
                setPendingCheck(null);
              }}
            />
          ) : (
            <InputPrompt onSubmit={handleUserInput} isDisabled={isBusy} fileContextEngine={fileContextEngine} />
          )}
        </>
      )}
    </Box>
  );
};
