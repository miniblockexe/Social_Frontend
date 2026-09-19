import { Injectable, signal } from '@angular/core';

export interface AppearanceSettings {
  animations: boolean;
  compact: boolean;
}

const STORAGE_KEY = 'sp-appearance';

const DEFAULT: AppearanceSettings = {
  animations: true,
  compact: false,
};

@Injectable({ providedIn: 'root' })
export class AppearanceService {
  settings = signal<AppearanceSettings>(this._load());

  init(): void {
    this._apply(this.settings());
  }

  save(s: AppearanceSettings): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
    this.settings.set(s);
    this._apply(s);
  }

  private _load(): AppearanceSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULT, ...(JSON.parse(raw) as Partial<AppearanceSettings>) };
    } catch {}
    return { ...DEFAULT };
  }

  private _apply(s: AppearanceSettings): void {
    document.body.classList.toggle('sp-no-animations', !s.animations);
    document.body.classList.toggle('sp-compact', s.compact);
  }
}
