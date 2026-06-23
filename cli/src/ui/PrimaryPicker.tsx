import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { MODEL_KEYS, type ModelKey } from '@token-derby/shared';

const LABELS: Record<ModelKey, string> = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini' };

export function PrimaryPicker({ onPick }: { onPick: (m: ModelKey) => void }) {
  const [i, setI] = useState(0);
  useInput((_input, key) => {
    if (key.upArrow) setI(p => (p + MODEL_KEYS.length - 1) % MODEL_KEYS.length);
    else if (key.downArrow) setI(p => (p + 1) % MODEL_KEYS.length);
    else if (key.return) onPick(MODEL_KEYS[i]!);
  });
  return (
    <Box flexDirection="column">
      <Text bold>Pick your primary model for this race (counts 1:1; the others count at 10%).</Text>
      <Text dimColor>This is locked for the whole race — you can't change it, even by rejoining.</Text>
      {MODEL_KEYS.map((m, idx) => (
        <Text key={m} color={idx === i ? 'cyan' : undefined}>
          {idx === i ? '❯ ' : '  '}{LABELS[m]}
        </Text>
      ))}
    </Box>
  );
}
