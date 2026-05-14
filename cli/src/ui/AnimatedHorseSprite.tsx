import React, { useEffect, useState } from 'react';
import type { HorseColors, Hat } from '@token-derby/shared';
import { HorseSprite } from './HorseSprite.js';
import type { SlotTag } from './sprite.js';

type Props = {
  sprite: readonly (readonly SlotTag[])[];
  colors: HorseColors;
  hat: Hat;
};

export function AnimatedHorseSprite({ sprite, colors, hat }: Props) {
  const [frameIdx, setFrameIdx] = useState(0);

  useEffect(() => {
    if (!hat.animation) return;
    const ms = Math.round(1000 / hat.animation.fps);
    const id = setInterval(() => {
      setFrameIdx(i => (i + 1) % hat.animation!.frames.length);
    }, ms);
    return () => clearInterval(id);
  }, [hat.animation]);

  const frameColor = hat.animation?.frames[frameIdx];
  return <HorseSprite sprite={sprite} colors={colors} hat={hat} frameColor={frameColor} />;
}
