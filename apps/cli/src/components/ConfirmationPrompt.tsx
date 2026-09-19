import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { PermissionCheck } from '@sentinel/permissions';
import { THEME } from '../theme.js';

interface ConfirmationPromptProps {
  check: PermissionCheck;
  onConfirm: (approved: boolean) => void;
}

export const ConfirmationPrompt: React.FC<ConfirmationPromptProps> = ({ check, onConfirm }) => {
  useInput((input, key) => {
    if (input.toLowerCase() === 'y' || key.return) onConfirm(true);
    else if (input.toLowerCase() === 'n' || key.escape || (key.ctrl && input === 'c')) onConfirm(false);
  });

  const command = (check.input as { command?: unknown })?.command;
  const commandString = typeof command === 'string' ? command : null;

  return (
    <Box flexDirection="column" marginY={1}>
      <Box marginBottom={1}>
        <Text color={THEME.warning} bold>● </Text>
        <Text bold>Permission requise : </Text>
        <Text color={THEME.green}>{check.toolName}</Text>
      </Box>
      <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
        {commandString ? <Box><Box width={10}><Text color={THEME.muted}>Command</Text></Box><Text color={THEME.green}>$ {commandString}</Text></Box> : null}
        <Box><Box width={10}><Text color={THEME.muted}>Reason</Text></Box><Text color={THEME.muted}>{check.reason}</Text></Box>
      </Box>
      <Box paddingLeft={2}><Text bold>Autoriser l'exécution ? </Text><Text color={THEME.warning}>[Y/n]</Text></Box>
    </Box>
  );
};
