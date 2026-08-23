/**
 * @sentinel/cli — Command Suggestions Overlay
 *
 * Displays an interactive dropdown / popup for slash commands,
 * inspired by Claude Code's CLI autocomplete UX.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { SlashCommand } from '../commands.js';

interface CommandSuggestionsProps {
  suggestions: SlashCommand[];
  selectedIndex: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  general: 'cyan',
  project: 'green',
  config: 'yellow',
  session: 'magenta',
};

export const CommandSuggestions: React.FC<CommandSuggestionsProps> = ({
  suggestions,
  selectedIndex,
}) => {
  if (suggestions.length === 0) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      paddingY={0}
      marginTop={1}
    >
      <Box marginBottom={0}>
        <Text bold color="cyan">
          Commands
        </Text>
        <Text color="gray"> ({suggestions.length} matching)</Text>
      </Box>

      {suggestions.map((cmd, idx) => {
        const isSelected = idx === selectedIndex;
        const categoryColor = CATEGORY_COLORS[cmd.category] ?? 'gray';

        return (
          <Box key={cmd.name} flexDirection="row" justifyContent="space-between" marginY={0}>
            <Box flexDirection="row">
              <Text bold color={isSelected ? 'cyan' : 'gray'}>
                {isSelected ? '❯ ' : '  '}
              </Text>
              <Text bold={isSelected} color={isSelected ? 'white' : 'cyan'}>
                {cmd.name.padEnd(14)}
              </Text>
              <Text color={isSelected ? 'white' : 'gray'}>
                {cmd.description}
              </Text>
            </Box>
            <Box marginLeft={2}>
              <Text color={categoryColor} dimColor={!isSelected}>
                [{cmd.category}]
              </Text>
            </Box>
          </Box>
        );
      })}

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={0}>
        <Text color="gray">
          <Text bold color="cyan">Tab</Text> complete  •  <Text bold color="cyan">↑/↓</Text> navigate  •  <Text bold color="cyan">Enter</Text> run  •  <Text bold color="cyan">Esc</Text> dismiss
        </Text>
      </Box>
    </Box>
  );
};
