/** @sentinel/cli - Conversation display */

import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface MessageListProps {
  messages: readonly DisplayMessage[];
  streamingContent?: string;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, streamingContent }) => (
  <Box flexDirection="column" marginY={0}>
    {messages.map((msg) => (
      <Box key={msg.id} flexDirection="column" marginBottom={1}>
        {msg.role === 'user' ? (
          <Box>
            <Text bold color={THEME.green}>&gt; </Text>
            <Text bold color={THEME.text}>{msg.content}</Text>
          </Box>
        ) : msg.role === 'assistant' ? (
          <Box flexDirection="column" paddingLeft={2}><Text color={THEME.text}>{msg.content}</Text></Box>
        ) : (
          <Box paddingLeft={2}><Text italic color={THEME.muted}>{msg.content}</Text></Box>
        )}
      </Box>
    ))}
    {streamingContent ? (
      <Box flexDirection="column" paddingLeft={2} marginBottom={1}><Text color={THEME.text}>{streamingContent}</Text></Box>
    ) : null}
  </Box>
);
