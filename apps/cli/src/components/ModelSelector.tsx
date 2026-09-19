/**
 * Runtime model selector. The provider is queried when this view opens;
 * no model identifier is maintained in the UI source.
 */

import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { LLMProvider, ModelDiscovery, ModelInfo } from '@sentinel/llm';

interface ModelSelectorProps {
  providerName: string;
  provider: LLMProvider;
  discovery: ModelDiscovery;
  currentModelId: string;
  onSelect: (modelId: string) => void;
  onCancel: () => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  providerName,
  provider,
  discovery,
  currentModelId,
  onSelect,
  onCancel,
}) => {
  const [models, setModels] = useState<readonly ModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [customModelInput, setCustomModelInput] = useState(currentModelId);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setLoadError(undefined);
    discovery.listModels(provider).then((discovered) => {
      if (!active) return;
      setModels(discovered);
      const currentIndex = discovered.findIndex((model) => model.id === currentModelId);
      setSelectedIndex(currentIndex >= 0 ? currentIndex : 0);
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [discovery, provider, currentModelId]);

  useInput((input, key) => {
    if (isLoading) {
      if (key.escape) onCancel();
      return;
    }
    if (models.length === 0) {
      if (key.escape || input === 'q' || input === 'Q') onCancel();
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((previous) => previous > 0 ? previous - 1 : models.length - 1);
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((previous) => previous < models.length - 1 ? previous + 1 : 0);
      return;
    }
    if (key.return) {
      const selected = models[selectedIndex];
      if (selected) onSelect(selected.id);
      return;
    }
    if (key.escape || input === 'q' || input === 'Q') onCancel();
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} paddingY={1} marginY={1}>
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">Select Active Model for {providerName}</Text>
        <Text color="gray">[↑/↓: Navigate • Enter: Select • Esc: Cancel]</Text>
      </Box>

      {isLoading ? <Text color="gray">Discovering models from {providerName}…</Text> : null}
      {!isLoading && loadError ? <Text color="yellow">Model discovery failed: {loadError}</Text> : null}
      {!isLoading && models.length === 0 ? (
        <Box flexDirection="column">
          <Text color="gray">No models were returned. Enter a provider model identifier:</Text>
          <TextInput
            value={customModelInput}
            onChange={setCustomModelInput}
            onSubmit={(value) => {
              const model = value.trim();
              if (model) onSelect(model);
            }}
            placeholder="model identifier"
          />
        </Box>
      ) : null}

      {models.map((model, index) => {
        const context = model.contextLength === undefined
          ? 'context unknown'
          : model.contextLength >= 1_000_000
            ? `${(model.contextLength / 1_000_000).toFixed(0)}M tokens`
            : `${(model.contextLength / 1_000).toFixed(0)}k tokens`;
        const selected = index === selectedIndex;
        return (
          <Box key={model.id} flexDirection="column" paddingLeft={1} marginBottom={index < models.length - 1 ? 1 : 0}>
            <Box>
              <Text bold color={selected ? 'cyan' : 'white'}>{selected ? '❯ ' : '  '}{model.displayName ?? model.id} </Text>
              <Text color="gray">({model.id}) • {context}</Text>
              {model.id === currentModelId ? <Text color="green"> [active]</Text> : null}
            </Box>
            <Box paddingLeft={2}>
              <Text color={selected ? 'white' : 'gray'}>
                {model.supportsReasoningEffort ? 'Native reasoning effort supported.' : 'Reasoning policy orchestrated by Sentinel.'}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
