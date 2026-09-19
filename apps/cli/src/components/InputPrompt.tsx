/**
 * @sentinel/cli — Input Prompt Component
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { getMatchingCommands, type SlashCommand } from '../commands.js';
import { CommandSuggestions } from './CommandSuggestions.js';
import type { FileContextEngine, FileMatch } from '@sentinel/context';
import { THEME } from '../theme.js';

interface InputPromptProps {
  onSubmit: (value: string) => void;
  isDisabled?: boolean;
  fileContextEngine?: FileContextEngine;
}

export const InputPrompt: React.FC<InputPromptProps> = ({ onSubmit, isDisabled, fileContextEngine }) => {
  const [value, setValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);
  const [fileSelectedIndex, setFileSelectedIndex] = useState(0);

  const showSuggestions = !isDisabled && !isDismissed && value.trim().startsWith('/') && !value.includes(' ');
  const matchingCommands = showSuggestions ? getMatchingCommands(value) : [];
  const fileQueryMatch = value.match(/(?:^|\s)@([^\s]*)$/);
  const showFileSuggestions = !isDisabled && !isDismissed && fileContextEngine !== undefined && fileQueryMatch !== null;
  const fileMatches: readonly FileMatch[] = showFileSuggestions && fileContextEngine && fileQueryMatch
    ? fileContextEngine.search(fileQueryMatch[1] ?? '', 8)
    : [];

  useEffect(() => {
    setSelectedIndex(0);
    setFileSelectedIndex(0);
  }, [value]);

  useInput((input, key) => {
    if (isDisabled) return;

    if (showFileSuggestions && fileMatches.length > 0) {
      if (key.upArrow) {
        setFileSelectedIndex((prev) => prev > 0 ? prev - 1 : fileMatches.length - 1);
        return;
      }
      if (key.downArrow) {
        setFileSelectedIndex((prev) => prev < fileMatches.length - 1 ? prev + 1 : 0);
        return;
      }
      if (key.tab) {
        const selected = fileMatches[fileSelectedIndex];
        const atIndex = value.lastIndexOf('@');
        if (selected && atIndex >= 0) setValue(`${value.slice(0, atIndex)}@${selected.path} `);
        return;
      }
      if (key.escape) {
        setIsDismissed(true);
        return;
      }
    }

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
      <Box
        borderStyle="round"
        borderColor={THEME.graphiteLight}
        paddingX={1}
      >
        <Text color={isDisabled ? THEME.muted : THEME.green}>{'> '}</Text>
        {isDisabled ? (
          <Text color={THEME.muted} dimColor>
            working…
          </Text>
        ) : (
          <TextInput
            value={value}
            onChange={handleChange}
            onSubmit={handleSubmit}
            placeholder="Ask anything, or / for commands"
          />
        )}
      </Box>

      {showSuggestions && (
        <CommandSuggestions
          suggestions={matchingCommands}
          selectedIndex={selectedIndex}
        />
      )}

      {showFileSuggestions && fileMatches.length > 0 ? (
        <Box flexDirection="column" paddingLeft={2}>
          {fileMatches.map((match, index) => (
            <Box key={match.path}>
              <Text color={index === fileSelectedIndex ? THEME.green : THEME.muted}>
                {index === fileSelectedIndex ? '❯ ' : '  '}{match.path}
              </Text>
            </Box>
          ))}
          <Text color="gray" dimColor>tab to complete file · ↑↓ to navigate</Text>
        </Box>
      ) : null}
    </Box>
  );
};
