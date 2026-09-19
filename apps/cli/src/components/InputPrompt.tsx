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

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// Fonction utilitaire pour formater le temps dynamiquement
const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h${String(minutes).padStart(2, '0')}m${String(seconds).padStart(2, '0')}s`;
  }
  if (minutes > 0) {
    return `${minutes}m${String(seconds).padStart(2, '0')}s`;
  }
  // En dessous d'une minute, on garde la décimale pour un effet fluide (ex: 12.5s)
  return `${(ms / 1000).toFixed(1)}s`;
};

export const InputPrompt: React.FC<InputPromptProps> = ({ onSubmit, isDisabled, fileContextEngine }) => {
  const [value, setValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);
  const [fileSelectedIndex, setFileSelectedIndex] = useState(0);

  const [elapsed, setElapsed] = useState(0);
  const [tick, setTick] = useState(0);

  const showSuggestions = !isDisabled && !isDismissed && value.trim().startsWith('/') && !value.includes(' ');
  const matchingCommands = showSuggestions ? getMatchingCommands(value) : [];
  const fileQueryMatch = value.match(/(?:^|\s)@([^\s]*)$/);
  const showFileSuggestions = !isDisabled && !isDismissed && fileContextEngine !== undefined && fileQueryMatch !== null;
  const fileMatches: readonly FileMatch[] = showFileSuggestions && fileContextEngine && fileQueryMatch
    ? fileContextEngine.search(fileQueryMatch[1] ?? '', 8)
    : [];

  useEffect(() => {
    if (!isDisabled) {
      setElapsed(0);
      setTick(0);
      return;
    }

    const startTime = Date.now();
    const timer = setInterval(() => {
      setElapsed(Date.now() - startTime);
      setTick((t) => t + 1);
    }, 80);

    return () => clearInterval(timer);
  }, [isDisabled]);

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
    if (isDismissed) setIsDismissed(false);
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

  const currentFrame = SPINNER_FRAMES[tick % SPINNER_FRAMES.length];
  const timeDisplay = formatTime(elapsed); // Utilisation de la nouvelle fonction

  return (
    <Box flexDirection="column" marginY={isDisabled ? 1 : 0}>
      {isDisabled ? (
        <Box paddingX={1} justifyContent="space-between">
          <Box>
            <Text color={THEME.green}>{currentFrame} </Text>
            <Text color={THEME.text}>Thinking</Text>
            <Text color={THEME.muted}>…</Text>
          </Box>
          <Box>
            <Text color={THEME.muted}>{timeDisplay}</Text>
          </Box>
        </Box>
      ) : (
        <Box borderStyle="round" borderColor={THEME.graphiteLight} paddingX={1}>
          <Text color={THEME.green}>❯ </Text>
          <TextInput
            value={value}
            onChange={handleChange}
            onSubmit={handleSubmit}
            placeholder="Ask anything, or / for commands"
          />
        </Box>
      )}

      {showSuggestions && (
        <CommandSuggestions
          suggestions={matchingCommands}
          selectedIndex={selectedIndex}
        />
      )}

      {showFileSuggestions && fileMatches.length > 0 ? (
        <Box flexDirection="column" paddingLeft={2} marginTop={1}>
          {fileMatches.map((match, index) => (
            <Box key={match.path}>
              <Box width={2}>
                {index === fileSelectedIndex ? <Text bold color={THEME.green}>❯</Text> : <Text> </Text>}
              </Box>
              <Text color={index === fileSelectedIndex ? THEME.text : THEME.muted}>
                {match.path}
              </Text>
            </Box>
          ))}
          <Box marginTop={1}>
            <Text color={THEME.muted}>tab to complete · ↑/↓ nav</Text>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
};