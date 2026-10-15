import type { Decorator, Preview } from '@storybook/angular-vite';
import { EVENT_STORAGE_KEY, EVENT_THEME, THEMES, THEME_STORAGE_KEY } from '../src/lib/theme/themes';

// The toolbar seeds the same storage ThemeService reads, so a story's picker agrees with it.
const withTheme: Decorator = (story, context) => {
  const theme = context.globals['theme'] ?? 'derby';
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    if (EVENT_THEME) localStorage.setItem(EVENT_STORAGE_KEY, EVENT_THEME.tag);
  } catch {
    // Storage blocked: the attribute below still themes the story.
  }
  document.documentElement.dataset['theme'] = theme;
  return story();
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Site theme',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: THEMES.map((t) => ({ value: t.id, title: t.label })),
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'derby' },
  parameters: {
    layout: 'centered',
    backgrounds: { disable: true },
    viewport: {
      options: {
        tv: { name: 'TV 1920×1080', styles: { width: '1920px', height: '1080px' } },
        desktop: { name: 'Desktop 1280×800', styles: { width: '1280px', height: '800px' } },
        phone: { name: 'Phone 390×844', styles: { width: '390px', height: '844px' } },
      },
    },
    a11y: { test: 'todo' },
  },
};

export default preview;
