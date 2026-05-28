import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import type { Hat } from '@token-derby/shared';
import { HatSprite, AnimatedHatSprite } from './HatSprite.js';
import { ansiFg } from './half-blocks.js';

const RESET = '\x1b[0m';

// The box itself is always the same warm-gold colour — it gives away no
// rarity. The rarity is revealed by the confetti burst once the box opens.
const BOX_COLOR = '#E5C76B';

// Palettes per rarity tier. Confetti picks uniformly from these.
const TIER_PALETTE: Record<Hat['rarity'], string[]> = {
  common:    ['#FFFFFF', '#DDDDDD', '#AAAAAA', '#9E9E9E'],
  rare:      ['#42A5F5', '#1E88E5', '#90CAF9', '#0277BD'],
  epic:      ['#AB47BC', '#8E24AA', '#CE93D8', '#6A1B9A'],
  legendary: ['#FFD700', '#FF7F00', '#FF0000', '#FF00FF', '#00BFFF', '#7CFC00', '#8B00FF'],
};

const CONFETTI_CHARS = ['✦', '✧', '⋆', '★', '☆', '✨', '*', '•', '◆', '◇'];

const SCENE_W = 32;
const SCENE_H = 10;

// ─── Box frames ──────────────────────────────────────────────────────

function pad(line: string): string {
  const visible = stripAnsi(line).length;
  const lead = Math.max(0, Math.floor((SCENE_W - visible) / 2));
  return ' '.repeat(lead) + line + ' '.repeat(Math.max(0, SCENE_W - lead - visible));
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

const BOX_CLOSED: string[] = [
  '',
  '',
  '╔═════════════╗',
  '║   ░░░░░     ║',
  '║░░░░░░░░░░░░░║',
  '║  ░░░░░░░░░  ║',
  '║░░░░░░░░░░░░░║',
  '╚═════════════╝',
  '',
  '',
].map(pad);

const BOX_OPENING_1: string[] = [
  '',
  '╔═════════════╗',
  '╚═════════════╝',
  '',
  '╔═════════════╗',
  '║     ✦       ║',
  '║░░░░░░░░░░░░░║',
  '╚═════════════╝',
  '',
  '',
].map(pad);

const BOX_OPENING_2: string[] = [
  '  ╔═════════════╗',
  '  ║             ║',
  '  ╚═════════════╝',
  '',
  '     ✨   ★   ✦',
  '',
  '╔═════════════╗',
  '║             ║',
  '╚═════════════╝',
  '',
].map(pad);

const BOX_EMPTY: string[] = [
  '',
  '',
  '',
  '',
  '',
  '',
  '╔═════════════╗',
  '║             ║',
  '╚═════════════╝',
  '',
].map(pad);

// ─── Gift box component ──────────────────────────────────────────────

function GiftBox({ frame, color }: { frame: string[]; color: string }) {
  return (
    <Box flexDirection="column">
      {frame.map((line, i) => (
        <Text key={i}>{line ? ansiFg(color) + line + RESET : line}</Text>
      ))}
    </Box>
  );
}

// ─── Confetti burst ──────────────────────────────────────────────────

type Particle = {
  x: number; y: number;
  vx: number; vy: number;
  char: string;
  color: string;
};

function spawnParticles(tier: Hat['rarity'], count: number, cx: number, cy: number): Particle[] {
  const palette = TIER_PALETTE[tier];
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    const speed = 0.8 + Math.random() * 1.6;
    out.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.5,
      char: CONFETTI_CHARS[Math.floor(Math.random() * CONFETTI_CHARS.length)]!,
      color: palette[Math.floor(Math.random() * palette.length)]!,
    });
  }
  return out;
}

function ConfettiBurst({ tier }: { tier: Hat['rarity'] }) {
  const cx = Math.floor(SCENE_W / 2);
  const cy = Math.floor(SCENE_H / 2);
  const particles = useMemo(() => spawnParticles(tier, 36, cx, cy), [tier, cx, cy]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 70);
    return () => clearInterval(i);
  }, []);

  const grid: string[][] = Array.from({ length: SCENE_H }, () => Array(SCENE_W).fill(' '));
  for (const p of particles) {
    const x = Math.round(p.x + p.vx * tick);
    const y = Math.round(p.y + p.vy * tick);
    if (x >= 0 && x < SCENE_W && y >= 0 && y < SCENE_H) {
      grid[y]![x] = ansiFg(p.color) + p.char + RESET;
    }
  }

  return (
    <Box flexDirection="column">
      {grid.map((row, y) => (
        <Text key={y}>{row.join('')}</Text>
      ))}
    </Box>
  );
}

// ─── Outcome-aware reveal ────────────────────────────────────────────

export type RollOutcome =
  | { kind: 'hat'; hat: Hat; variant?: number }
  | { kind: 'duplicate'; hat: Hat; variant?: number }
  | { kind: 'no_hat' };

type RevealProps = {
  outcome: RollOutcome;
  onDone: () => void;
};

/**
 * Plays the reveal animation. Starts with a 3s "closed box" suspense
 * beat, then lifts the lid. Sequence depends on outcome:
 *   - hat / duplicate: open → tier-coloured burst → hat shown alone
 *   - no_hat:          open → empty box pause → done (no confetti)
 */
const CLOSED_HOLD_MS = 3000;

export function RollReveal({ outcome, onDone }: RevealProps) {
  const isNoHat = outcome.kind === 'no_hat';
  const isLegendary = outcome.kind !== 'no_hat' && outcome.hat.rarity === 'legendary';

  const [phase, setPhase] = useState<'closed' | 'open1' | 'open2' | 'burst' | 'empty' | 'reveal'>('closed');

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setPhase('open1'), CLOSED_HOLD_MS));
    timers.push(setTimeout(() => setPhase('open2'), CLOSED_HOLD_MS + 350));
    if (isNoHat) {
      timers.push(setTimeout(() => setPhase('empty'), CLOSED_HOLD_MS + 700));
      timers.push(setTimeout(onDone, CLOSED_HOLD_MS + 1500));
    } else {
      timers.push(setTimeout(() => setPhase('burst'), CLOSED_HOLD_MS + 700));
      timers.push(setTimeout(() => setPhase('reveal'), CLOSED_HOLD_MS + 1650));
      timers.push(setTimeout(onDone, CLOSED_HOLD_MS + (isLegendary ? 4650 : 2650)));
    }
    return () => timers.forEach(clearTimeout);
  }, [isNoHat, isLegendary, onDone]);

  if (phase === 'closed') return <GiftBox frame={BOX_CLOSED} color={BOX_COLOR} />;
  if (phase === 'open1') return <GiftBox frame={BOX_OPENING_1} color={BOX_COLOR} />;
  if (phase === 'open2') return <GiftBox frame={BOX_OPENING_2} color={BOX_COLOR} />;
  if (phase === 'empty') return <GiftBox frame={BOX_EMPTY}     color={BOX_COLOR} />;
  if (phase === 'burst' && outcome.kind !== 'no_hat') {
    return <ConfettiBurst tier={outcome.hat.rarity} />;
  }
  // phase === 'reveal' — only reachable for hat/duplicate outcomes
  if (outcome.kind === 'no_hat') return <GiftBox frame={BOX_EMPTY} color={BOX_COLOR} />;
  return outcome.hat.rarity === 'legendary'
    ? <AnimatedHatSprite hat={outcome.hat} centerIn={{ w: SCENE_W, h: SCENE_H }} />
    : <HatSprite hat={outcome.hat} variant={outcome.variant} centerIn={{ w: SCENE_W, h: SCENE_H }} />;
}
