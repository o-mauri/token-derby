import React from 'react';
import { render, Box, Text } from 'ink';
import type { StableHorse } from '@token-derby/shared';
import { listStable } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';
import { HorseSprite } from '../ui/HorseSprite.js';
import { MINI_SPRITE } from '../ui/sprite.js';

export async function stableListCommand(): Promise<number> {
  let horses: StableHorse[];
  try {
    const resp = await listStable();
    horses = resp.horses;
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }

  if (horses.length === 0) {
    console.log('Your stable is empty. Run `token-derby stable create` to add a horse.');
    return 0;
  }
  const app = render(
    React.createElement(StableList, { horses }),
  );
  await app.waitUntilExit();
  return 0;
}

function StableList({ horses }: { horses: StableHorse[] }) {
  React.useEffect(() => {
    setImmediate(() => process.exit(0));
  }, []);
  return (
    <Box flexDirection="column">
      <Text bold>Your stable ({horses.length}):</Text>
      {horses.map(h => (
        <Box key={h.stable_horse_id} flexDirection="row" marginTop={1}>
          <HorseSprite sprite={MINI_SPRITE} colors={h.colors} />
          <Text>  {h.name}</Text>
        </Box>
      ))}
    </Box>
  );
}
