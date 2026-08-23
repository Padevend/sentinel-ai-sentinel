/**
 * @sentinel/cli — Confirmation Prompt
 *
 * Rendered when a tool requires explicit user confirmation before executing.
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { PermissionCheck } from '@sentinel/permissions';

interface ConfirmationPromptProps {
  check: PermissionCheck;
  onConfirm: (approved: boolean) => void;
}

export const ConfirmationPrompt: React.FC<ConfirmationPromptProps> = ({ check, onConfirm }) => {
  useInput((input, key) => {
    if (input.toLowerCase() === 'y' || key.return) {
      onConfirm(true);
    } else if (input.toLowerCase() === 'n' || key.escape) {
      onConfirm(false);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={1} marginY={1}>
      <Text bold color="yellow">⚠️  Permission Confirmation Required</Text>
      <Text color="white">Operation: <Text bold color="cyan">{check.toolName}</Text></Text>
      <Text color="gray">{check.reason}</Text>
      <Box marginTop={1}>
        <Text color="yellow">Allow this action? (y/n / Enter=Yes): </Text>
      </Box>
    </Box>
  );
};
