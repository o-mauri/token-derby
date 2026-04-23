import React from 'react';
import { render, Box, Text } from 'ink';
import { loadStable } from '../stable/stable.js';
import { HorseSprite } from '../ui/HorseSprite.js';
import { MINI_SPRITE } from '../ui/sprite.js';

export async function stableListCommand(): Promise<number> {
  const stable = await loadStable();
  if (stable.horses.length === 0) {
    console.log('Your stable is empty. Run `token-derby stable create` to add a horse.');
    return 0;
  }
  const app = render(
    React.createElement(StableList, { horses: stable.horses }),
  );
  await app.waitUntilExit();
  return 0;
}

function StableList({ horses }: { horses: { name: string; colors: any; created_at: string }[] }) {
  React.useEffect(() => {
    setImmediate(() => process.exit(0));
  }, []);
  return (
    <Box flexDirection="column">
      <Text bold>Your stable ({horses.length}):</Text>
      {horses.map(h => (
        <Box key={h.name} flexDirection="row" marginTop={1}>
          <HorseSprite sprite={MINI_SPRITE} colors={h.colors} />
          <Text>  {h.name}</Text>
        </Box>
      ))}
    </Box>
  );
}
