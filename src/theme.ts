export const ACCENTS = {
  pink: { label: 'Light pink', hue: 340, saturation: 56 },
  lavender: { label: 'Lavender', hue: 268, saturation: 45 },
  blue: { label: 'Sky blue', hue: 210, saturation: 58 },
  mint: { label: 'Mint', hue: 155, saturation: 33 },
  peach: { label: 'Peach', hue: 24, saturation: 65 },
  gold: { label: 'Butter yellow', hue: 44, saturation: 60 },
} as const;
export type Accent = keyof typeof ACCENTS;
export interface Theme { accent: Accent; background: 'cold' | 'warm' }
export const DEFAULT_THEME: Theme = { accent: 'pink', background: 'cold' };
export const THEME_KEY = 'chordguessr.theme.v1';

export function loadTheme(): Theme {
  try {
    const value = JSON.parse(sessionStorage.getItem(THEME_KEY) ?? 'null');
    if (value && Object.hasOwn(ACCENTS, value.accent) && ['cold', 'warm'].includes(value.background)) return { accent: value.accent, background: value.background };
  } catch { /* The default theme also works with storage disabled. */ }
  return { ...DEFAULT_THEME };
}

export function applyTheme(theme: Theme): void {
  const { hue, saturation } = ACCENTS[theme.accent];
  const root = document.documentElement;
  root.style.setProperty('--accent-h', String(hue));
  root.style.setProperty('--accent-s', `${saturation}%`);
  root.dataset.accent = theme.accent;
  root.dataset.background = theme.background;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.background === 'cold' ? '#f3f4f8' : '#f8f4ef');
}

export function saveTheme(theme: Theme): void {
  try { sessionStorage.setItem(THEME_KEY, JSON.stringify(theme)); }
  catch { /* Changing colors should still work without browser storage. */ }
}
