/**
 * @sentinel/cli — Model Selector Component
 *
 * Interactive selection menu for choosing or switching models
 * for the current provider.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { getAvailableModels, type ModelInfo } from '@sentinel/llm';

interface ModelSelectorProps {
  providerName: string;
  currentModelId: string;
  onSelect: (modelId: string) => void;
  onCancel: () => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  providerName,
  currentModelId,
  onSelect,
  onCancel,
}) => {
  const models = getAvailableModels(providerName);
  const initialIndex = models.findIndex((m) => m.id === currentModelId);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex >= 0 ? initialIndex : 0);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : models.length - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => (prev < models.length - 1 ? prev + 1 : 0));
      return;
    }
    if (key.return) {
      const selected = models[selectedIndex];
      if (selected) {
        onSelect(selected.id);
      }
      return;
    }
    if (key.escape || input === 'q' || input === 'Q') {
      onCancel();
      return;
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      paddingY={1}
      marginY={1}
    >
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">
          Select Active Model for {providerName}
        </Text>
        <Text color="gray">[↑/↓: Navigate • Enter: Select • Esc: Cancel]</Text>
      </Box>

      {models.map((model, idx) => {
        const isSelected = idx === selectedIndex;
        const isCurrent = model.id === currentModelId;
        const contextStr =
          model.contextWindow >= 1_000_000
            ? `${(model.contextWindow / 1_000_000).toFixed(0)}M tokens`
            : `${(model.contextWindow / 1_000).toFixed(0)}k tokens`;

        return (
          <Box
            key={model.id}
            flexDirection="column"
            paddingLeft={1}
            marginBottom={idx < models.length - 1 ? 1 : 0}
          >
            <Box>
              <Text bold color={isSelected ? 'cyan' : 'white'}>
                {isSelected ? '❯ ' : '  '}
                {model.name}{' '}
              </Text>
              <Text color="gray">
                ({model.id}) • {contextStr}
              </Text>
              {isCurrent && <Text color="green"> [active]</Text>}
            </Box>
            <Box paddingLeft={2}>
              <Text color={isSelected ? 'white' : 'gray'}>
                {model.description}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
