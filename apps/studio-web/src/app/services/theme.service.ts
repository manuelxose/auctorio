import { isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

export type StudioThemePreference = 'light' | 'dark' | 'system';
export type StudioEffectiveTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'auctorio-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly browser = isPlatformBrowser(this.platformId);

  private readonly preferenceState = signal<StudioThemePreference>('system');
  private readonly effectiveState = signal<StudioEffectiveTheme>('light');
  private media: MediaQueryList | null = null;

  readonly preference = this.preferenceState.asReadonly();
  readonly effective = this.effectiveState.asReadonly();
  readonly isDark = computed(() => this.effectiveState() === 'dark');

  constructor() {
    if (!this.browser) {
      return;
    }
    this.media = window.matchMedia('(prefers-color-scheme: dark)');
    this.media.addEventListener('change', () => {
      if (this.preferenceState() === 'system') {
        this.applySystem();
      }
    });
    this.preferenceState.set(this.readPreference());
    this.apply(this.preferenceState());
  }

  setPreference(preference: StudioThemePreference): void {
    this.preferenceState.set(preference);
    if (this.browser) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, preference);
      } catch {
        // Storage unavailable — preference still applies for the session.
      }
    }
    this.apply(preference);
  }

  cycle(): StudioThemePreference {
    const next: StudioThemePreference =
      this.preferenceState() === 'light'
        ? 'dark'
        : this.preferenceState() === 'dark'
          ? 'system'
          : 'light';
    this.setPreference(next);
    return next;
  }

  private readPreference(): StudioThemePreference {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
      }
    } catch {
      // fall through
    }
    return 'system';
  }

  private apply(preference: StudioThemePreference): void {
    if (preference === 'system') {
      this.applySystem();
      return;
    }
    this.setEffective(preference);
  }

  private applySystem(): void {
    const dark = this.media?.matches ?? false;
    this.setEffective(dark ? 'dark' : 'light');
  }

  private setEffective(theme: StudioEffectiveTheme): void {
    this.effectiveState.set(theme);
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) {
      meta.content = theme === 'dark' ? '#0b1220' : '#f6f8fb';
    }
  }
}
