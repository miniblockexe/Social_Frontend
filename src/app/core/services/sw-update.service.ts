import { Injectable, inject, signal } from '@angular/core';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class SwUpdateService {
  private waitingWorker: ServiceWorker | null = null;
  hasUpdate = signal(false);

  init(): void {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then((reg) => {
      reg.update();

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            this.waitingWorker = newWorker;
            this.hasUpdate.set(true);
          }
        });
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }

  applyUpdate(): void {
    this.waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
  }

  dismiss(): void {
    this.hasUpdate.set(false);
  }
}
