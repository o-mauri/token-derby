import { describe, it, expect, beforeEach } from 'vitest';
import { renderAchievementToast } from '../src/render/toast.js';

beforeEach(() => {
  document.body.innerHTML = '<div id="container"></div>';
});

describe('renderAchievementToast', () => {
  it('builds a DOM node containing horse name, achievement name, description, and XP', () => {
    const node = renderAchievementToast(document, {
      horseName: 'Thundercloud',
      name: 'Overtake!',
      description: 'Overtook another horse',
      xp: 3,
    });
    expect(node.textContent).toContain('Thundercloud gained Overtake!');
    expect(node.textContent).toContain('Overtook another horse');
    expect(node.textContent).toContain('+3 XP');
    expect(node.classList.contains('achievement-toast')).toBe(true);
  });
});
