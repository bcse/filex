import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getEffectiveTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? getSystemTheme() : theme;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const effectiveTheme = getEffectiveTheme(theme);

  if (effectiveTheme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export const useThemeStore = create<ThemeState>((set) => {
  // Initialize from localStorage or system preference
  const savedTheme = (typeof window !== 'undefined'
    ? localStorage.getItem('theme') as Theme
    : null) || 'system';

  // Apply initial theme
  if (typeof window !== 'undefined') {
    applyTheme(savedTheme);

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const currentTheme = localStorage.getItem('theme') as Theme || 'system';
      if (currentTheme === 'system') {
        applyTheme('system');
      }
    });
  }

  return {
    theme: savedTheme,
    setTheme: (theme) => {
      localStorage.setItem('theme', theme);
      applyTheme(theme);
      set({ theme });
    },
  };
});
