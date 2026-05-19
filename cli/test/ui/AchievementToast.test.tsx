import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { AchievementToast } from '../../src/ui/AchievementToast.js';

describe('AchievementToast', () => {
  it('renders the horse name, achievement name, description and XP', () => {
    const { lastFrame } = render(
      <AchievementToast
        horseName="Thundercloud"
        name="Overtake!"
        description="Overtook another horse"
        xp={3}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('+3 XP');
    expect(frame).toContain('Thundercloud gained Overtake!');
    expect(frame).toContain('Overtook another horse');
  });
});
