import React from 'react';
import { Box, Text, useInput } from 'ink';

interface ResumeConfirmationProps {
  sessionId: string;
  warning?: string;
  onDecision: (approved: boolean) => void | Promise<void>;
}

export const ResumeConfirmation: React.FC<ResumeConfirmationProps> = ({ sessionId, warning, onDecision }) => {
  useInput((input) => {
    if (input.toLowerCase() === 'y') onDecision(true);
    if (input.toLowerCase() === 'n' || input === '\u001b') onDecision(false);
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginY={1}>
      <Text color="yellow">Session {sessionId} was interrupted.</Text>
      <Text>{warning ?? 'The workspace will be checked before continuing.'}</Text>
      <Text color="cyan">Resume it? [y/N]</Text>
    </Box>
  );
};
