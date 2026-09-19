import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { PermissionLevel } from '@sentinel/core';
import { BUILTIN_TOOL_PERMISSION_LEVELS } from '@sentinel/permissions';
import type { PermissionOverride, PermissionPolicy } from '@sentinel/permissions';
import { THEME } from '../theme.js';

interface PermissionPanelProps {
  policy: PermissionPolicy;
  onApply: (update: {
    defaultLevel: PermissionLevel;
    overrides: readonly PermissionOverride[];
    persist: boolean;
  }) => Promise<void>;
  onCancel: () => void;
}

const LEVELS: readonly PermissionLevel[] = ['safe', 'confirm_recommended', 'confirm_required'];
const LEVEL_LABELS: Readonly<Record<PermissionLevel, string>> = {
  safe: 'auto',
  confirm_recommended: 'confirmer',
  confirm_required: 'toujours confirmer',
};

function nextLevel(level: PermissionLevel, direction: 1 | -1): PermissionLevel {
  const index = LEVELS.indexOf(level);
  return LEVELS[(index + direction + LEVELS.length) % LEVELS.length] ?? 'safe';
}

export const PermissionPanel: React.FC<PermissionPanelProps> = ({ policy, onApply, onCancel }) => {
  const tools = useMemo(() => Object.keys(BUILTIN_TOOL_PERMISSION_LEVELS), []);
  const items = useMemo(() => ['__default__', ...tools], [tools]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [defaultLevel, setDefaultLevel] = useState<PermissionLevel>(policy.defaultLevel);
  const [overrides, setOverrides] = useState<readonly PermissionOverride[]>(policy.overrides);

  const levelFor = (tool: string): PermissionLevel => {
    if (tool === '__default__') return defaultLevel;
    return overrides.find((override) => override.tool === tool)?.level
      ?? BUILTIN_TOOL_PERMISSION_LEVELS[tool]
      ?? defaultLevel;
  };

  const changeSelected = (direction: 1 | -1): void => {
    const selected = items[selectedIndex];
    if (!selected) return;
    const current = levelFor(selected);
    const updated = nextLevel(current, direction);
    if (selected === '__default__') {
      setDefaultLevel(updated);
      return;
    }
    setOverrides((currentOverrides) => [
      ...currentOverrides.filter((override) => override.tool !== selected),
      { tool: selected, level: updated },
    ]);
  };

  const apply = (persist: boolean): void => {
    void onApply({ defaultLevel, overrides, persist });
  };

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((index) => index > 0 ? index - 1 : items.length - 1);
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((index) => index < items.length - 1 ? index + 1 : 0);
      return;
    }
    if (key.leftArrow) {
      changeSelected(-1);
      return;
    }
    if (key.rightArrow) {
      changeSelected(1);
      return;
    }
    if (key.return) {
      apply(false);
      return;
    }
    if (input.toLowerCase() === 'g') {
      apply(true);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.graphiteLight} paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color={THEME.green}>Permissions</Text>
        <Text color={THEME.muted}>←/→ modifier · Entrée session · G enregistrer · Échap fermer</Text>
      </Box>
      <Text color={THEME.muted}>Les changements de session sont immédiats. Les commandes bloquées restent refusées.</Text>
      <Box flexDirection="column" marginTop={1}>
        {items.map((tool, index) => {
          const selected = index === selectedIndex;
          const label = tool === '__default__' ? 'Autres tools (défaut)' : tool;
          const level = levelFor(tool);
          return (
            <Box key={tool}>
              <Text color={selected ? THEME.green : THEME.muted}>{selected ? '› ' : '  '}</Text>
              <Box width={29}><Text color={selected ? THEME.text : THEME.muted}>{label}</Text></Box>
              <Text color={level === 'safe' ? THEME.green : level === 'confirm_required' ? THEME.warning : THEME.text}>
                {LEVEL_LABELS[level]}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
