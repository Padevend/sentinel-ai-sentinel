/**
 * @sentinel/cli — Tool Activity Component
 *
 * Displays ongoing and completed operational tool actions:
 * ◉ Reading package.json
 * ✓ Found application entry point
 * ✗ 2 tests failed
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface ActivityItem {
  id: string;
  type: 'pending' | 'success' | 'failure';
  message: string;
}

interface ToolActivityProps {
  activities: readonly ActivityItem[];
}

export const ToolActivity: React.FC<ToolActivityProps> = ({ activities }) => {
  if (activities.length === 0) return null;

  return (
    <Box flexDirection="column" marginY={1} paddingLeft={1}>
      {activities.map((item) => {
        let icon = '◉ ';
        let color = 'yellow';

        if (item.type === 'success') {
          icon = '✓ ';
          color = 'green';
        } else if (item.type === 'failure') {
          icon = '✗ ';
          color = 'red';
        }

        return (
          <Box key={item.id}>
            <Text color={color}>{icon}</Text>
            <Text color="gray">{item.message}</Text>
          </Box>
        );
      })}
    </Box>
  );
};
