import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SwUpdateService {
  hasUpdate = signal(false);
  private currentHash = '';

  init(): void {
    this.getCurrentHash().then((h) => {
      this.currentHash = h;
      setInterval(() => this.checkForUpdate(), 2 * 60 * 1000);
    });
  }

  private async getCurrentHash(): Promise<string> {
    try {
      const res = await fetch('/index.html?_=' + Date.now(), {
        cache: 'no-store',
      });
      const text = await res.text();
      const match = text.match(/main\.[a-f0-9]+\.js/);
      return match?.[0] ?? '';
    } catch {
      return '';
    }
  }

  private async checkForUpdate(): Promise<void> {
    const newHash = await this.getCurrentHash();
    if (newHash && newHash !== this.currentHash) {
      this.hasUpdate.set(true);
    }
  }

  applyUpdate(): void {
    window.location.reload();
  }

  dismiss(): void {
    this.hasUpdate.set(false);
  }
}
