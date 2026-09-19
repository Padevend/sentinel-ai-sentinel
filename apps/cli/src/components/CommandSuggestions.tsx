import React from 'react';
import { Box, Text } from 'ink';
import type { SlashCommand } from '../commands.js';
import { THEME } from '../theme.js';

interface CommandSuggestionsProps {
  suggestions: SlashCommand[];
  selectedIndex: number;
}

export const CommandSuggestions: React.FC<CommandSuggestionsProps> = ({ suggestions, selectedIndex }) => {
  if (suggestions.length === 0) return null;
  return (
    <Box flexDirection="column" paddingLeft={2}>
      {suggestions.map((cmd, idx) => {
        const selected = idx === selectedIndex;
        return (
          <Box key={cmd.name}>
            <Text color={selected ? THEME.green : THEME.muted}>{selected ? '› ' : '  '}</Text>
            <Text color={selected ? THEME.green : THEME.muted} bold={selected}>{cmd.name.padEnd(14)}</Text>
            <Text color={selected ? THEME.text : THEME.muted} dimColor={!selected}>{cmd.description}</Text>
          </Box>
        );
      })}
      <Text color={THEME.muted} dimColor>Tab compléter · ↑↓ naviguer · Échap fermer</Text>
    </Box>
  );
};
