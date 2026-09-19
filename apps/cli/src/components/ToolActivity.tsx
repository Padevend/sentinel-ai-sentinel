/** @sentinel/cli - Tool activity display */

import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';

export interface ActivityItem {
  id: string;
  type: 'pending' | 'success' | 'failure';
  message: string;
}

interface ToolActivityProps { activities: readonly ActivityItem[]; }

export const ToolActivity: React.FC<ToolActivityProps> = ({ activities }) => {
  if (activities.length === 0) return null;
  return (
    <Box flexDirection="column" marginY={0} paddingLeft={1}>
      {activities.map((item) => {
        const icon = item.type === 'success' ? '✓ ' : item.type === 'failure' ? '✗ ' : '· ';
        const color = item.type === 'success' ? THEME.green : item.type === 'failure' ? THEME.danger : THEME.warning;
        return <Box key={item.id}><Text color={color}>{icon}</Text><Text color={THEME.muted}>{item.message}</Text></Box>;
      })}
    </Box>
  );
};
