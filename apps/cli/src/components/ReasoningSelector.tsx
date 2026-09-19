import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReasoningEffort } from '@sentinel/llm';
import { THEME } from '../theme.js';

interface ReasoningSelectorProps {
  current?: ReasoningEffort;
  onSelect: (effort: ReasoningEffort | undefined) => Promise<void>;
  onCancel: () => void;
}

type ReasoningOption = {
  readonly value: ReasoningEffort | undefined;
  readonly label: string;
  readonly description: string;
};

const OPTIONS: readonly ReasoningOption[] = [
  { value: undefined, label: 'auto', description: 'la politique du provider et de la tâche' },
  { value: 'low', label: 'low', description: 'réponse rapide, vérification légère' },
  { value: 'medium', label: 'medium', description: 'équilibre vitesse / robustesse' },
  { value: 'high', label: 'high', description: 'plus de contexte et de vérification' },
  { value: 'max', label: 'max', description: 'vérification approfondie, plus coûteuse' },
];

function selectedIndex(current: ReasoningEffort | undefined): number {
  const index = OPTIONS.findIndex((option) => option.value === current);
  return index >= 0 ? index : 0;
}

export const ReasoningSelector: React.FC<ReasoningSelectorProps> = ({ current, onSelect, onCancel }) => {
  const [index, setIndex] = useState(() => selectedIndex(current));

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.upArrow) {
      setIndex((value) => value > 0 ? value - 1 : OPTIONS.length - 1);
      return;
    }
    if (key.downArrow) {
      setIndex((value) => value < OPTIONS.length - 1 ? value + 1 : 0);
      return;
    }
    if (key.return) {
      const option = OPTIONS[index];
      if (option) void onSelect(option.value);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.graphiteLight} paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color={THEME.green}>Reasoning effort</Text>
        <Text color={THEME.muted}>↑/↓ choisir · Entrée appliquer · Échap fermer</Text>
      </Box>
      <Text color={THEME.muted}>Sentinel adapte le réglage aux capacités natives du provider.</Text>
      <Box flexDirection="column" marginTop={1}>
        {OPTIONS.map((option, optionIndex) => {
          const selected = optionIndex === index;
          return (
            <Box key={option.label}>
              <Text color={selected ? THEME.green : THEME.muted}>{selected ? '› ' : '  '}</Text>
              <Box width={13}><Text bold={selected} color={selected ? THEME.text : THEME.muted}>{option.label}</Text></Box>
              <Text color={selected ? THEME.text : THEME.muted}>{option.description}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
