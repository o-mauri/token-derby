import { useEffect, useRef } from 'react';
import type { CollectedHat, HorseColors } from '@token-derby/shared';
import { hatById } from '@token-derby/shared';
import { buildHorseSvg } from './sprite-svg.js';
import { buildHatGroup } from './hat-svg.js';

export type HorseSpriteProps = {
  colors: HorseColors;
  hat?: CollectedHat | null;
  size?: number;
};

// Wraps the site's DOM-based sprite renderer for React: the SVG is built
// imperatively into a ref (same rectangles, same hierarchy) rather than
// reimplemented as JSX, so it stays byte-for-byte the horse the CLI and
// site render. Colors are passed down as CSS custom properties so a single
// build works for every horse without touching the SVG's own fill values.
export default function HorseSprite({ colors, hat, size = 64 }: HorseSpriteProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.replaceChildren();
    const svg = buildHorseSvg(document);
    if (hat) {
      const hatDef = hatById(hat.id);
      if (hatDef) svg.appendChild(buildHatGroup(document, hatDef, hat.variant ?? 0));
    }
    el.appendChild(svg);
  }, [hat?.id, hat?.variant]);

  const style = {
    width: size,
    height: size,
    '--body': colors.body,
    '--mane': colors.mane,
    '--tail': colors.tail,
    '--saddle': colors.saddle,
  } as React.CSSProperties;

  return <div className="horse-sprite-wrap" ref={ref} style={style} />;
}
