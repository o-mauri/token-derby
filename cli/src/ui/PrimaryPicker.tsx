import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { MODEL_KEYS, modelLabel, type ModelKey } from '@token-derby/shared';

export function PrimaryPicker({
  models = MODEL_KEYS,
  onPick,
}: {
  models?: readonly ModelKey[];
  onPick: (m: ModelKey) => void;
}) {
  const [i, setI] = useState(0);
  useInput((_input, key) => {
    if (key.upArrow) setI(p => (p + models.length - 1) % models.length);
    else if (key.downArrow) setI(p => (p + 1) % models.length);
    else if (key.return) onPick(models[i]!);
  });
  return (
    <Box flexDirection="column">
      <Text bold>Pick your primary model for this race (counts 1:1; the others count at 50%).</Text>
      <Text dimColor>This is locked for the whole race — you can't change it, even by rejoining.</Text>
      {models.map((model, idx) => (
        <Text key={model} color={idx === i ? 'cyan' : undefined}>
          {idx === i ? '❯ ' : '  '}{modelLabel(model)}
        </Text>
      ))}
    </Box>
  );
}
