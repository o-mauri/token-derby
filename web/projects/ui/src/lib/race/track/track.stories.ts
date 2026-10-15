import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Button } from '../../button/button';
import { Slider } from '../../forms/slider/slider';
import { laneProgress, leaderTokens } from '../logic/progress';
import { staminaBand } from '../logic/stamina';
import type { LaneState, LaneView } from '../models';
import { RaceTrack } from './track';

type Runner = { id: string; name: string; owner: string; rate: number; tire: number; hat: string | null; colors: LaneView['colors'] };

const COLOURS: LaneView['colors'][] = [
  { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' },
  { body: '#FFFFFF', mane: '#000000', tail: '#000000', saddle: '#1B4F72' },
  { body: '#CD853F', mane: '#FFD700', tail: '#FFD700', saddle: '#196F3D' },
  { body: '#4A235A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#EAB308' },
  { body: '#1E40AF', mane: '#000000', tail: '#000000', saddle: '#DC2626' },
  { body: '#16A34A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#A16207' },
];
const NAMES = ['Thunderhoof', 'Bytewind', 'Gallop GPT', 'Sir Prompts-a-Lot', 'Slow Lorris', 'Neigh Sayer', 'Token Ring', 'Mane Frame',
  'Hay Wire', 'Colt Runtime', 'Foal Stack', 'Pony Express', 'Trot Cache', 'Bit Bridle', 'Stallion Stack', 'Canter Loop',
  'Rein Check', 'Mare Mutex', 'Saddle Sort', 'Gee Pee You'];
const HATS = ['stetson', 'viking_helmet', 'rainbow_crown', null, 'plague_doctor', 'party_hat', null, 'london_bus'];

function field(size: number): Runner[] {
  return Array.from({ length: size }, (_, i) => ({
    id: `h${i}`, name: NAMES[i % NAMES.length]!, owner: ['omar', 'sam', 'ana', 'jo', 'kit'][i % 5]!,
    // Different speeds and tiring rates, so the order shuffles as the race goes on.
    rate: 900 + ((i * 397) % 700), tire: (i * 13) % 7, hat: HATS[i % HATS.length] ?? null, colors: COLOURS[i % COLOURS.length]!,
  }));
}

@Component({
  selector: 'sb-live-track',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RaceTrack, Button, Slider],
  template: `
    <div class="controls">
      <button td-button type="button" (click)="toggle()">{{ playing() ? 'Pause' : 'Play' }}</button>
      <td-slider class="scrub" label="Race elapsed" [min]="0" [max]="100" [step]="0.5" [format]="pct" [(value)]="elapsed" />
    </div>
    <td-race-track class="track" [style.height.px]="height()" [lanes]="lanes()" [progressById]="progress()" [state]="state()" />
  `,
  styles: `
    :host { display: grid; gap: var(--td-space-5); }
    .controls { display: flex; align-items: end; gap: var(--td-space-6); padding: 0 var(--td-space-5); }
    .scrub { width: min(420px, 60vw); }
  `,
})
class LiveTrack {
  readonly size = input(8);
  readonly height = input(560);
  protected readonly elapsed = signal(35);
  protected readonly playing = signal(false);
  protected readonly pct = (n: number) => `${n}%`;
  private readonly runners = computed(() => field(this.size()));
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  protected readonly state = computed<LaneState>(() => (this.elapsed() === 0 ? 'pending' : this.elapsed() >= 100 ? 'finished' : 'live'));

  // Scores at the current point in the race; tired horses slow down late on.
  private readonly scores = computed(() => {
    const t = this.elapsed() / 100;
    return this.runners().map((r) => Math.round(r.rate * 1000 * t * (1 - (r.tire / 20) * t * t)));
  });

  protected readonly lanes = computed<LaneView[]>(() => {
    const scores = this.scores();
    const t = this.elapsed() / 100;
    return this.runners().map((r, i) => {
      const stamina = Math.max(0, Math.round(100 - r.tire * 14 * t));
      return {
        id: r.id, name: r.name, owner: r.owner, colors: r.colors, hat: r.hat ? { id: r.hat } : null,
        tokens: scores[i]!, level: 1 + (i % 12), pace: t > 0 ? Math.round(r.rate * (1 - (r.tire / 10) * t)) : null,
        position: 1 + scores.filter((s) => s > scores[i]!).length, league: null,
        stamina: { value: stamina, band: staminaBand(stamina, 20) },
      };
    });
  });

  protected readonly progress = computed(() => {
    const scores = this.scores();
    const leader = leaderTokens(scores);
    return Object.fromEntries(this.runners().map((r, i) => [r.id, laneProgress(scores[i]!, leader, this.elapsed() / 100)]));
  });

  protected toggle(): void {
    if (this.playing()) {
      clearInterval(this.timer);
      this.playing.set(false);
      return;
    }
    if (this.elapsed() >= 100) this.elapsed.set(0);
    this.playing.set(true);
    this.timer = setInterval(() => {
      const next = Math.min(100, this.elapsed() + 1);
      this.elapsed.set(next);
      if (next >= 100) this.toggle();
    }, 1000);
  }
}

const meta: Meta<LiveTrack> = { title: 'Race/Live track', component: LiveTrack, parameters: { layout: 'fullscreen' } };
export default meta;

/** Press Play to run the race (1% a second), or scrub with the slider. Horses glide over 3s to each new position. */
export const LiveRace: StoryObj<LiveTrack> = {};
/** A 20-horse field taller than the box: the track bounces up and down on its own, and backs off if you scroll. */
export const BigFieldAutoScroll: StoryObj<LiveTrack> = { args: { size: 20, height: 420 } };
