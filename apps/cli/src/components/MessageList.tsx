/**
 * @sentinel/cli — MessageList Component
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface MessageListProps {
  messages: readonly DisplayMessage[];
  streamingContent?: string;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, streamingContent }) => {
  return (
    <Box flexDirection="column" marginY={1}>
      {messages.map((msg) => (
        <Box key={msg.id} flexDirection="column" marginBottom={1}>
          {msg.role === 'user' ? (
            <Box>
              <Text bold color="blue">&gt; </Text>
              <Text bold color="white">{msg.content}</Text>
            </Box>
          ) : msg.role === 'assistant' ? (
            <Box flexDirection="column" paddingLeft={2}>
              <Text color="white">{msg.content}</Text>
            </Box>
          ) : (
            <Box paddingLeft={2}>
              <Text italic color="gray">{msg.content}</Text>
            </Box>
          )}
        </Box>
      ))}

      {streamingContent ? (
        <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
          <Text color="white">{streamingContent}</Text>
        </Box>
      ) : null}
    </Box>
  );
};
