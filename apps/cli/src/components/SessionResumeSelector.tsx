/**
 * @sentinel/cli — Session Resume Selector Component
 *
 * Displays an interactive list of recent sessions for the current project,
 * allowing the user to select one to resume or press Escape to start fresh.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SessionSummary } from '@sentinel/core';

interface SessionResumeSelectorProps {
  sessions: readonly SessionSummary[];
  projectName: string;
  onSelect: (session: SessionSummary) => void;
  onCancel: () => void;
}

export const SessionResumeSelector: React.FC<SessionResumeSelectorProps> = ({
  sessions,
  projectName,
  onSelect,
  onCancel,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : sessions.length - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => (prev < sessions.length - 1 ? prev + 1 : 0));
      return;
    }
    if (key.return) {
      const selected = sessions[selectedIndex];
      if (selected) {
        onSelect(selected);
      }
      return;
    }
    if (key.escape || input === 'q' || input === 'Q') {
      onCancel();
      return;
    }
  });

  if (sessions.length === 0) {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor="yellow">
        <Text color="yellow">No previous sessions found for project "{projectName}".</Text>
        <Text color="gray">Press any key or Enter to start a new session...</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      paddingY={1}
      marginY={1}
    >
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">
          Resume Session for: {projectName}
        </Text>
        <Text color="gray">[↑/↓: Navigate • Enter: Resume • Esc: New Session]</Text>
      </Box>

      {sessions.map((sess, idx) => {
        const isSelected = idx === selectedIndex;
        const dateStr = new Date(sess.updatedAt).toLocaleString();
        const statusColor =
          sess.status === 'active'
            ? 'green'
            : sess.status === 'interrupted'
              ? 'yellow'
              : sess.status === 'completed'
                ? 'blue'
                : 'gray';

        return (
          <Box
            key={sess.id}
            flexDirection="column"
            paddingLeft={1}
            marginBottom={idx < sessions.length - 1 ? 1 : 0}
          >
            <Box>
              <Text bold color={isSelected ? 'cyan' : 'white'}>
                {isSelected ? '❯ ' : '  '}
                {sess.taskSummary || `Session ${sess.id}`}{' '}
              </Text>
              <Text color={statusColor}>[{sess.status}]</Text>
              <Text color="gray"> • {dateStr}</Text>
            </Box>
            <Box paddingLeft={2}>
              <Text color="gray">
                ID: {sess.id} • Model: {sess.modelId || 'default'}
                {sess.filesModified.length > 0 ? ` • ${sess.filesModified.length} file(s) modified` : ''}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
