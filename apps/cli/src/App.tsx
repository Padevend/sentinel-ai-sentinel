/**
 * @sentinel/cli — Root Application Component
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import type {
  ProjectInfo,
  ResolvedConfig,
  ModelResponseChunkEvent,
  ToolStartedEvent,
  ToolCompletedEvent,
} from '@sentinel/core';
import { updateSettings, resetSettings } from '@sentinel/core';
import { createProvider, type LLMProvider } from '@sentinel/llm';
import type { AgentKernel, AgentSession, SessionManager } from '@sentinel/agent';
import type { PermissionCheck } from '@sentinel/permissions';
import { Header } from './components/Header.js';
import { MessageList, type DisplayMessage } from './components/MessageList.js';
import { ToolActivity, type ActivityItem } from './components/ToolActivity.js';
import { InputPrompt } from './components/InputPrompt.js';
import { ConfirmationPrompt } from './components/ConfirmationPrompt.js';
import { ModelSelector } from './components/ModelSelector.js';
import { parseSlashCommand } from './commands.js';

interface AppProps {
  projectInfo: ProjectInfo;
  kernel: AgentKernel;
  session: AgentSession;
  sessionManager?: SessionManager;
  resolvedConfig: ResolvedConfig;
  initialProviderName: string;
  initialModelId: string;
  initialMessage?: string;
}

export const App: React.FC<AppProps> = ({
  projectInfo,
  kernel,
  session,
  sessionManager,
  resolvedConfig,
  initialProviderName,
  initialModelId,
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
  const [currentModelId, setCurrentModelId] = useState<string>(initialModelId);
  const [mode, setMode] = useState<'chat' | 'model_select'>('chat');
  const [pendingCheck, setPendingCheck] = useState<{
    check: PermissionCheck;
    resolve: (approved: boolean) => void;
  } | null>(null);

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
          model: newModelId,
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
          },
        },
      };
      const newProvider = createProvider(updatedResolvedConfig);
      (kernel as unknown as { provider: LLMProvider }).provider = newProvider;

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

  const handleReset = async () => {
    try {
      await resetSettings();
      setMessages([]);
      session.clear();
      setMessages([
        {
          id: `sys-${Date.now()}`,
          role: 'system',
          content:
            '✓ All Sentinel configuration and credentials have been reset to defaults.\n' +
            'Settings file ~/sentinel/config/settings.json removed. Restart Sentinel to run the setup wizard again.',
        },
      ]);
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

  const handleUserInput = async (input: string) => {
    // 1. Handle Slash Commands
    const action = parseSlashCommand(input, {
      projectInfo,
      modelId: currentModelId,
      providerName,
      clearMessages: () => {
        setMessages([]);
        session.clear();
      },
      exitApp: async () => {
        session.setStatus('completed');
        if (sessionManager) {
          await sessionManager.saveSession(session);
        }
        exit();
      },
      openModelSelector: () => setMode('model_select'),
      resetConfig: handleReset,
    });

    if (action !== null) {
      if (action.type === 'open_model_selector') {
        setMode('model_select');
        return;
      }

      if (action.type === 'reset') {
        await handleReset();
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

      const result = await kernel.run(input, session, { autoVerify: true });
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
      <Header projectInfo={projectInfo} modelName={`${currentModelId} (${providerName})`} />

      {mode === 'model_select' ? (
        <ModelSelector
          providerName={providerName}
          currentModelId={currentModelId}
          onSelect={handleModelChange}
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
            <InputPrompt onSubmit={handleUserInput} isDisabled={isBusy} />
          )}
        </>
      )}
    </Box>
  );
};
