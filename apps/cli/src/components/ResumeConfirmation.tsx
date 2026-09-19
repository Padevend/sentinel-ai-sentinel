import React from 'react';
import { Box, Text, useInput } from 'ink';
import { THEME } from '../theme.js';

interface ResumeConfirmationProps {
  sessionId: string;
  warning?: string;
  onDecision: (approved: boolean) => void | Promise<void>;
}

export const ResumeConfirmation: React.FC<ResumeConfirmationProps> = ({ sessionId, warning, onDecision }) => {
  useInput((input, key) => {
    if (input.toLowerCase() === 'y') onDecision(true);
    // Le "N" majuscule indique le choix par défaut. On accepte 'n', Escape, ou Entrée pour refuser.
    if (input.toLowerCase() === 'n' || key.escape || key.return) onDecision(false);
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.warning} paddingX={1} marginBottom={1}>

      {/* En-tête de la box aligné sur le style Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Box>
          <Text bold color={THEME.warning}>▲ Session Interrupted</Text>
          <Text color={THEME.muted}> · {sessionId}</Text>
        </Box>
        <Box>
          <Text color={THEME.muted}>y confirm · n/esc/↵ cancel</Text>
        </Box>
      </Box>

      {/* Message d'avertissement principal */}
      <Box marginBottom={1}>
        <Text color={THEME.text}>{warning ?? 'The workspace will be checked before continuing.'}</Text>
      </Box>

      {/* Ligne d'action avec le curseur standard */}
      <Box>
        <Box width={2}>
          <Text bold color={THEME.warning}>❯</Text>
        </Box>
        <Text color={THEME.text}>Resume this session? </Text>
        <Text color={THEME.muted}>[y/</Text>
        <Text bold color={THEME.text}>N</Text>
        <Text color={THEME.muted}>]</Text>
      </Box>

    </Box>
  );
};