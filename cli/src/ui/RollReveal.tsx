import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import type { Hat } from '@token-derby/shared';
import { HatSprite, AnimatedHatSprite } from './HatSprite.js';
import { ansiFg } from './half-blocks.js';

const RESET = '\x1b[0m';

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

// ─── Box frames (each 25 chars wide, 10 rows tall to match scene) ──

const PAD = (line: string): string => {
  const visible = stripAnsi(line).length;
  const lead = Math.max(0, Math.floor((SCENE_W - visible) / 2));
  return ' '.repeat(lead) + line + ' '.repeat(Math.max(0, SCENE_W - lead - visible));
};

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
].map(PAD);

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
].map(PAD);

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
].map(PAD);

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
      // Terminal cells are taller than wide → less vertical movement so the
      // visual disc looks roughly circular rather than squashed.
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

// ─── Main RollReveal ─────────────────────────────────────────────────

type Props = {
  hat: Hat;
  variant?: number;
  onDone: () => void;
};

export function RollReveal({ hat, variant, onDone }: Props) {
  const [phase, setPhase] = useState<'closed' | 'open1' | 'open2' | 'burst' | 'reveal'>('closed');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('open1'),  450);
    const t2 = setTimeout(() => setPhase('open2'),  800);
    const t3 = setTimeout(() => setPhase('burst'), 1100);
    const t4 = setTimeout(() => setPhase('reveal'),2050);
    const isLegendary = hat.rarity === 'legendary';
    // Total reveal: box (1.1s) + burst (0.95s) + hat (3s legendary / 1s non-legendary)
    const t5 = setTimeout(onDone, isLegendary ? 5050 : 3050);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); };
  }, []);

  const primaryColor = TIER_PALETTE[hat.rarity][0]!;

  if (phase === 'closed') return <GiftBox frame={BOX_CLOSED}     color={primaryColor} />;
  if (phase === 'open1')  return <GiftBox frame={BOX_OPENING_1}  color={primaryColor} />;
  if (phase === 'open2')  return <GiftBox frame={BOX_OPENING_2}  color={primaryColor} />;
  if (phase === 'burst')  return <ConfettiBurst tier={hat.rarity} />;

  // reveal: show the hat itself, centered in the same scene canvas.
  return hat.rarity === 'legendary'
    ? <AnimatedHatSprite hat={hat} centerIn={{ w: SCENE_W, h: SCENE_H }} />
    : <HatSprite hat={hat} variant={variant} centerIn={{ w: SCENE_W, h: SCENE_H }} />;
}
