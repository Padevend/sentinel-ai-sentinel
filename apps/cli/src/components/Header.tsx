/**
 * @sentinel/cli - Header Component
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ProjectInfo } from '@sentinel/core';
import { THEME } from '../theme.js';

interface HeaderProps {
  projectInfo: ProjectInfo;
  modelName: string;
  reasoningEffort?: string;
  version?: string;
  cwd?: string;
  gitBranch?: string;
}

const Dot: React.FC<{ color: string }> = ({ color }) => <Text color={color}>●</Text>;

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <Box>
    <Box width={9}><Text color={THEME.muted}>{label}</Text></Box>
    {children}
  </Box>
);

export const Header: React.FC<HeaderProps> = ({
  projectInfo,
  modelName,
  reasoningEffort,
  version = '0.1.0',
  cwd,
  gitBranch,
}) => {
  const stack = [...projectInfo.languages, ...projectInfo.frameworks].filter(Boolean).join(' · ') || 'General';

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.graphiteLight} paddingX={1} marginBottom={1}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Box>
          <Text bold color={THEME.green}>▲ Sentinel</Text>
          <Text color={THEME.muted}> v{version}</Text>
        </Box>
        <Box>
          <Dot color={THEME.greenStrong} />
          <Text color={THEME.text}> {modelName}</Text>
          <Text color={THEME.green}> · effort:{reasoningEffort ?? 'auto'}</Text>
        </Box>
      </Box>

      <Row label="Project">
        <Text color={THEME.text}>{projectInfo.name}</Text>
        <Text color={THEME.muted}> ({stack})</Text>
      </Row>

      {cwd ? <Row label="Dir"><Text color={THEME.muted}>{cwd}</Text></Row> : null}

      <Row label="Status">
        <Text color={THEME.text}>{projectInfo.fileCount}</Text>
        <Text color={THEME.muted}> files · git </Text>
        <Dot color={projectInfo.hasGit ? THEME.greenStrong : THEME.warning} />
        <Text color={THEME.muted}> {projectInfo.hasGit ? 'linked' : 'none'}</Text>
        {projectInfo.hasGit && gitBranch ? <Text color={THEME.green}> · {gitBranch}</Text> : null}
      </Row>
    </Box>
  );
};
