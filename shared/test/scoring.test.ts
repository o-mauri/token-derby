import { describe, it, expect } from 'vitest';
import { scoreTick, scoredOf, staminaOf, resolveModifierParams, runsModifier, validateModifierSettings, resolveStaminaConfig } from '../src/scoring.js';
import { MODIFIERS } from '../src/scoring/registry.js';

describe('scoreTick — no toggles', () => {
  it('returns the delta unchanged when no mechanic is enabled', () => {
    const r = scoreTick({ delta: 1234, components: { anthropic: 1234, openai: 0, google: 0 }, dt_ms: 60_000, race: {}, modifier_states: {} });
    expect(r.scored_delta).toBe(1234);
  });

  it('is the identity for a zero delta', () => {
    expect(scoreTick({ delta: 0, components: { anthropic: 0, openai: 0, google: 0 }, dt_ms: 60_000, race: {}, modifier_states: {} }).scored_delta).toBe(0);
  });

  it('leaves state untouched when no mechanic is enabled', () => {
    const r = scoreTick({ delta: 500, components: { anthropic: 500, openai: 0, google: 0 }, dt_ms: 30_000, race: {}, modifier_states: {} });
    expect(r.modifier_states).toEqual({});
  });

  it('is the identity regardless of dt', () => {
    for (const dt_ms of [1_000, 60_000, 7_200_000]) {
      expect(scoreTick({ delta: 999, components: { anthropic: 999, openai: 0, google: 0 }, dt_ms, race: {}, modifier_states: {} }).scored_delta).toBe(999);
    }
  });

  it('passes a fractional delta through byte-for-byte, without rounding', () => {
    const r = scoreTick({ delta: 2000.5, components: { anthropic: 2000.5, openai: 0, google: 0 }, dt_ms: 60_000, race: {}, modifier_states: {} });
    expect(r.scored_delta).toBe(2000.5);
  });
});

describe('scoredOf', () => {
  it('prefers scored_tokens when present', () => {
    expect(scoredOf({ current_tokens: 10, scored_tokens: 7 })).toBe(7);
  });

  it('falls back to current_tokens when scored_tokens is absent', () => {
    expect(scoredOf({ current_tokens: 10 })).toBe(10);
  });

  it('treats a scored_tokens of 0 as a real value, not absent', () => {
    expect(scoredOf({ current_tokens: 10, scored_tokens: 0 })).toBe(0);
  });
});

describe('scoreTick — stamina enabled', () => {
  it('scores at full rate while fresh and drains', () => {
    const r = scoreTick({
      delta: 80_000, components: { anthropic: 80_000, openai: 0, google: 0 }, dt_ms: 60_000, race: { stamina: true }, modifier_states: { stamina: { level: 100 } },
    });
    expect(r.scored_delta).toBe(80_000);         // fresh: full multiplier
    expect(r.modifier_states.stamina?.level).toBeCloseTo(96);     // 2x sustainable -> 4/min
  });

  it('tapers the delta once below the floor', () => {
    const r = scoreTick({
      delta: 1_000, components: { anthropic: 1_000, openai: 0, google: 0 }, dt_ms: 60_000, race: { stamina: true }, modifier_states: { stamina: { level: 12.5 } },
    });
    expect(r.scored_delta).toBeCloseTo(750);
  });

  it('starts an absent stamina at 100', () => {
    const r = scoreTick({ delta: 100, components: { anthropic: 100, openai: 0, google: 0 }, dt_ms: 60_000, race: { stamina: true }, modifier_states: {} });
    expect(r.scored_delta).toBe(100);
    expect(r.modifier_states.stamina?.level).toBe(100);
  });

  it('rounds a fractional delta even at full stamina, once the mechanic is on', () => {
    const r = scoreTick({
      delta: 2000.5, components: { anthropic: 2000.5, openai: 0, google: 0 }, dt_ms: 60_000, race: { stamina: true }, modifier_states: { stamina: { level: 100 } },
    });
    expect(r.scored_delta).toBe(2001);
  });

  it('ignores stamina entirely when the toggle is off', () => {
    const r = scoreTick({
      delta: 40_000, components: { anthropic: 40_000, openai: 0, google: 0 }, dt_ms: 60_000, race: {}, modifier_states: { stamina: { level: 3 } },
    });
    expect(r.scored_delta).toBe(40_000);
    expect(r.modifier_states.stamina?.level).toBe(3);
  });

  it('carries an unrelated modifier\'s state through untouched', () => {
    const r = scoreTick({
      delta: 1_000, components: { anthropic: 1_000, openai: 0, google: 0 }, dt_ms: 60_000,
      race: { stamina: true },
      // A state bag no active modifier owns -- a mechanic switched off mid-race,
      // or one this release no longer runs. Dropping it would reset it silently.
      modifier_states: { stamina: { level: 100 }, ghost: { charge: 7 } } as never,
    });
    expect((r.modifier_states as Record<string, { charge: number }>).ghost).toEqual({ charge: 7 });
  });

  it('treats a zero dt as a no-op rather than dividing by zero', () => {
    const r = scoreTick({ delta: 500, components: { anthropic: 500, openai: 0, google: 0 }, dt_ms: 0, race: { stamina: true }, modifier_states: { stamina: { level: 100 } } });
    expect(Number.isFinite(r.scored_delta)).toBe(true);
    expect(r.modifier_states.stamina?.level).toBe(100);
  });
});

describe('resolveStaminaConfig', () => {
  it('returns the modifier\'s own declared defaults when nothing is stamped', () => {
    const declared = Object.fromEntries(
      Object.entries(MODIFIERS.stamina.params).map(([k, b]) => [k, b.default]),
    );
    expect(resolveStaminaConfig({})).toEqual(declared);
  });

  it('applies only the named fields of a partial override', () => {
    const r = resolveStaminaConfig({ modifiers: { stamina: { enabled: true, params: { drain_per_min: 9 } } } });
    expect(r.drain_per_min).toBe(9);
    expect(r.sustainable_pace).toBe(MODIFIERS.stamina.params.sustainable_pace!.default);
  });
});

describe('validateModifierSettings — tuning', () => {
  const on = (params: Record<string, unknown>) => validateModifierSettings({ stamina: { enabled: true, params } });

  it('accepts an in-range value', () => {
    expect(on({ drain_per_min: 7 }).ok).toBe(true);
  });

  it('rejects a value below its minimum and above its maximum', () => {
    expect(on({ sustainable_pace: 10 }).ok).toBe(false);
    expect(on({ tired_multiplier: 1.5 }).ok).toBe(false);
  });

  it('rejects a non-numeric value', () => {
    expect(on({ drain_per_min: 'fast' }).ok).toBe(false);
  });

  it('rejects a key inherited from Object.prototype rather than treating it as a bound', () => {
    // Indexing params with an inherited name returns a function, so a truthy
    // check would pass it through and range-compare against undefined.
    expect(on({ hasOwnProperty: 5 }).ok).toBe(false);
    expect(on({ toString: 1 }).ok).toBe(false);
  });

  it('rejects a __proto__ key from parsed JSON instead of silently dropping it', () => {
    expect(on(JSON.parse('{"__proto__": 5}')).ok).toBe(false);
  });

  it('rejects the same inherited names as modifier ids', () => {
    expect(validateModifierSettings({ hasOwnProperty: { enabled: true } }).ok).toBe(false);
    expect(validateModifierSettings(JSON.parse('{"__proto__": {"enabled": true}}')).ok).toBe(false);
  });
});

describe('staminaOf', () => {
  it('reads the level out of the modifier state map', () => {
    expect(staminaOf({ modifier_states: { stamina: { level: 42 } } })).toBe(42);
  });

  it('reads full for a horse with no state yet', () => {
    expect(staminaOf({})).toBe(100);
    expect(staminaOf({ modifier_states: {} })).toBe(100);
  });

  it('reads full when another modifier has state but stamina does not', () => {
    expect(staminaOf({ modifier_states: { other: { x: 1 } } as never })).toBe(100);
  });
});

const STAMINA_DEFAULT_PACE = 40_000;

describe('modifiersForRace — which mechanics a race runs', () => {
  const beat = { delta: 80_000, components: { anthropic: 80_000, openai: 0, google: 0 }, dt_ms: 60_000 };

  it('runs a mechanic the race switched on', () => {
    const r = scoreTick({ ...beat, race: { modifiers: { stamina: { enabled: true } } }, modifier_states: { stamina: { level: 10 } } });
    expect(r.scored_delta).toBeLessThan(80_000);
  });

  it('skips a mechanic the race switched off, even with tuning stored for it', () => {
    const r = scoreTick({
      ...beat,
      race: { modifiers: { stamina: { enabled: false, params: { taper_floor: 60 } } } },
      modifier_states: { stamina: { level: 10 } },
    });
    expect(r.scored_delta).toBe(80_000);
  });

  it('skips a mechanic the race says nothing about, since none ship on', () => {
    const r = scoreTick({ ...beat, race: { modifiers: {} }, modifier_states: { stamina: { level: 10 } } });
    expect(r.scored_delta).toBe(80_000);
  });

  it('applies the race\'s own tuning, not the modifier defaults', () => {
    // taper_floor 60 puts a level-50 horse in the taper; the default 25 does not.
    const tuned = scoreTick({
      ...beat,
      race: { modifiers: { stamina: { enabled: true, params: { taper_floor: 60 } } } },
      modifier_states: { stamina: { level: 50 } },
    });
    const untuned = scoreTick({
      ...beat,
      race: { modifiers: { stamina: { enabled: true } } },
      modifier_states: { stamina: { level: 50 } },
    });
    expect(tuned.scored_delta).toBeLessThan(untuned.scored_delta);
    expect(untuned.scored_delta).toBe(80_000);
  });
});

describe('modifiersForRace — races created before the settings map', () => {
  const beat = { delta: 80_000, components: { anthropic: 80_000, openai: 0, google: 0 }, dt_ms: 60_000 };
  const tired = { stamina: { level: 10 } };

  it('keeps scoring a race that carries the old flag', () => {
    const r = scoreTick({ ...beat, race: { stamina: true }, modifier_states: tired });
    expect(r.scored_delta).toBeLessThan(80_000);
  });

  it('keeps honouring the old config snapshot', () => {
    const legacy = scoreTick({
      ...beat, race: { stamina: true, stamina_config: { taper_floor: 60 } },
      modifier_states: { stamina: { level: 50 } },
    });
    expect(legacy.scored_delta).toBeLessThan(80_000);
  });

  it('leaves a race that never had the flag alone', () => {
    expect(scoreTick({ ...beat, race: {}, modifier_states: tired }).scored_delta).toBe(80_000);
  });

  it('prefers the map once a race has one, ignoring a stale flag beside it', () => {
    const r = scoreTick({
      ...beat,
      race: { modifiers: { stamina: { enabled: false } }, stamina: true },
      modifier_states: tired,
    });
    expect(r.scored_delta).toBe(80_000);
  });
});

describe('resolveModifierParams', () => {
  it('layers a race\'s overrides on the modifier defaults', () => {
    const p = resolveModifierParams({ modifiers: { stamina: { enabled: true, params: { taper_floor: 40 } } } }, 'stamina');
    expect(p.taper_floor).toBe(40);
    expect(p.sustainable_pace).toBe(STAMINA_DEFAULT_PACE);
  });

  it('reads the old config snapshot for a race created before the map', () => {
    expect(resolveModifierParams({ stamina: true, stamina_config: { taper_floor: 40 } }, 'stamina').taper_floor).toBe(40);
  });

  it('returns the defaults for a race with no configuration at all', () => {
    expect(resolveModifierParams({}, 'stamina').taper_floor).toBe(25);
  });
});

describe('validateModifierSettings', () => {
  it('accepts a mechanic switched on with no tuning', () => {
    const r = validateModifierSettings({ stamina: { enabled: true } });
    expect(r).toEqual({ ok: true, value: { stamina: { enabled: true } } });
  });

  it('keeps tuning submitted alongside the switch', () => {
    const r = validateModifierSettings({ stamina: { enabled: false, params: { taper_floor: 40 } } });
    expect(r.ok && r.value.stamina).toEqual({ enabled: false, params: { taper_floor: 40 } });
  });

  it('rejects an unknown mechanic rather than storing it', () => {
    // A typo stored verbatim would read as a mechanic that is simply switched
    // off -- indistinguishable from the admin having chosen that.
    const r = validateModifierSettings({ stamna: { enabled: true } });
    expect(r.ok).toBe(false);
  });

  it('rejects a missing or non-boolean enabled', () => {
    expect(validateModifierSettings({ stamina: {} }).ok).toBe(false);
    expect(validateModifierSettings({ stamina: { enabled: 'yes' } }).ok).toBe(false);
  });

  it('rejects tuning outside a param\'s declared bounds', () => {
    expect(validateModifierSettings({ stamina: { enabled: true, params: { taper_floor: 999 } } }).ok).toBe(false);
  });

  it('rejects a param the mechanic does not declare', () => {
    expect(validateModifierSettings({ stamina: { enabled: true, params: { nonsense: 1 } } }).ok).toBe(false);
  });

  it('accepts an empty submission', () => {
    expect(validateModifierSettings({})).toEqual({ ok: true, value: {} });
  });
});

describe('runsModifier — the one answer every surface reads', () => {
  it('reads the settings map', () => {
    expect(runsModifier({ modifiers: { stamina: { enabled: true } } }, 'stamina')).toBe(true);
    expect(runsModifier({ modifiers: { stamina: { enabled: false } } }, 'stamina')).toBe(false);
  });

  it('reads the pre-settings-map stamina flag', () => {
    expect(runsModifier({ stamina: true }, 'stamina')).toBe(true);
    expect(runsModifier({ stamina: false }, 'stamina')).toBe(false);
  });

  it('falls back to the modifier own default when a race configures nothing', () => {
    expect(runsModifier({}, 'stamina')).toBe(MODIFIERS.stamina.enabledByDefault);
  });

  it('agrees with what the engine actually scores, in both shapes', () => {
    for (const race of [{ modifiers: { stamina: { enabled: true } } }, { stamina: true }]) {
      const r = scoreTick({
        delta: 1_000_000, components: { anthropic: 1_000_000, openai: 0, google: 0 },
        dt_ms: 60_000, race, modifier_states: { stamina: { level: 10 } },
      });
      expect(runsModifier(race, 'stamina')).toBe(true);
      expect(r.scored_delta).toBeLessThan(1_000_000);
    }
  });
});
