/**
 * @sentinel/cli — Input Prompt Component
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { getMatchingCommands, type SlashCommand } from '../commands.js';
import { CommandSuggestions } from './CommandSuggestions.js';

interface InputPromptProps {
  onSubmit: (value: string) => void;
  isDisabled?: boolean;
}

export const InputPrompt: React.FC<InputPromptProps> = ({ onSubmit, isDisabled }) => {
  const [value, setValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);

  const showSuggestions = !isDisabled && !isDismissed && value.trim().startsWith('/') && !value.includes(' ');
  const matchingCommands = showSuggestions ? getMatchingCommands(value) : [];

  useEffect(() => {
    setSelectedIndex(0);
  }, [value]);

  useInput((input, key) => {
    if (isDisabled) return;

    if (showSuggestions && matchingCommands.length > 0) {
      if (key.upArrow) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : matchingCommands.length - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((prev) => (prev < matchingCommands.length - 1 ? prev + 1 : 0));
        return;
      }
      if (key.tab) {
        const selected = matchingCommands[selectedIndex];
        if (selected) {
          setValue(selected.name);
        }
        return;
      }
      if (key.escape) {
        setIsDismissed(true);
        return;
      }
    }
  });

  const handleChange = (val: string) => {
    setValue(val);
    if (isDismissed) {
      setIsDismissed(false);
    }
  };

  const handleSubmit = (val: string) => {
    if (!val.trim() || isDisabled) return;

    let finalCommand = val.trim();
    if (showSuggestions && matchingCommands.length > 0 && selectedIndex >= 0 && selectedIndex < matchingCommands.length) {
      const selected = matchingCommands[selectedIndex];
      if (selected && (finalCommand === '/' || selected.name.startsWith(finalCommand))) {
        finalCommand = selected.name;
      }
    }

    setValue('');
    setIsDismissed(false);
    onSubmit(finalCommand);
  };

  return (
    <Box flexDirection="column">
      <Box marginTop={1}>
        <Text bold color="cyan">&gt; </Text>
        {isDisabled ? (
          <Text color="gray">Sentinel is thinking...</Text>
        ) : (
          <TextInput
            value={value}
            onChange={handleChange}
            onSubmit={handleSubmit}
            placeholder="Ask Sentinel anything, or type /help..."
          />
        )}
      </Box>

      {showSuggestions && (
        <CommandSuggestions
          suggestions={matchingCommands}
          selectedIndex={selectedIndex}
        />
      )}
    </Box>
  );
};
