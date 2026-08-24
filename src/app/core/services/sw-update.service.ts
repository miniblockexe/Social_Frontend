import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SwUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  hasUpdate = signal(false);
  isUpdating = signal(false);

  init(): void {
    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => {
        this.swUpdate.activateUpdate().then(() => {
          this.hasUpdate.set(true);
        });
      });

    this.swUpdate.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_INSTALLATION_FAILED') {
        console.warn('[SW] Cài đặt phiên bản mới thất bại, đang reset SW...');
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => regs.forEach((r) => r.unregister()))
          .finally(() => window.location.reload());
      }
    });

    this.swUpdate.checkForUpdate();
    setInterval(() => this.swUpdate.checkForUpdate(), 2 * 60 * 1000);
  }

  applyUpdate(): void {
    this.hasUpdate.set(false);
    this.isUpdating.set(true);

    const blocker = document.createElement('div');
    blocker.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:99999',
      'background:#111113',
      'display:flex',
      'align-items:center',
      'justify-content:center',
    ].join(';');
    blocker.innerHTML = `
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
        <circle cx="22" cy="22" r="18" stroke="rgba(16,185,129,0.15)" stroke-width="3"/>
        <circle cx="22" cy="22" r="18" stroke="#10b981" stroke-width="3"
          stroke-linecap="round" stroke-dasharray="28 84"
          style="transform-origin:center;animation:sw-spin 1.1s linear infinite"/>
      </svg>
      <style>@keyframes sw-spin{to{transform:rotate(360deg)}}</style>
    `;
    document.body.appendChild(blocker);

    setTimeout(() => window.location.reload(), 400);
  }

  dismiss(): void {
    this.hasUpdate.set(false);
  }
}
