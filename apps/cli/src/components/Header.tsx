/**
 * @sentinel/cli — Header Component
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ProjectInfo } from '@sentinel/core';

interface HeaderProps {
  projectInfo: ProjectInfo;
  modelName: string;
}

export const Header: React.FC<HeaderProps> = ({ projectInfo, modelName }) => {
  const stack = [
    ...projectInfo.languages,
    ...projectInfo.frameworks,
  ].filter(Boolean).join(' / ') || 'General';

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">Sentinel</Text>
        <Text color="gray">Model: {modelName}</Text>
      </Box>
      <Box justifyContent="space-between">
        <Text color="gray">Project: <Text color="white">{projectInfo.name}</Text> ({stack})</Text>
        <Text color="gray">Files: <Text color="white">{projectInfo.fileCount}</Text> | Git: <Text color={projectInfo.hasGit ? "green" : "yellow"}>{projectInfo.hasGit ? "✓" : "✗"}</Text></Text>
      </Box>
    </Box>
  );
};
