import React from 'react';
import { Box, Text } from 'ink';

export type AchievementToastProps = {
  horseName: string;
  name: string;
  description: string;
  xp: number;
};

export function AchievementToast({ horseName, name, description, xp }: AchievementToastProps) {
  return (
    <Box borderStyle="round" borderColor="yellow" paddingX={1} marginTop={1}>
      <Box flexDirection="column" justifyContent="center" marginRight={1}>
        <Text bold color="yellow">+{xp} XP</Text>
      </Box>
      <Box flexDirection="column">
        <Text bold>{horseName} gained {name}</Text>
        <Text dimColor>{description}</Text>
      </Box>
    </Box>
  );
}
