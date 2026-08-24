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
        this.hasUpdate.set(true);
      });

    this.swUpdate.checkForUpdate();
    setInterval(() => this.swUpdate.checkForUpdate(), 2 * 60 * 1000);
  }

  applyUpdate(): void {
    this.hasUpdate.set(false);
    this.isUpdating.set(true);

    const doReload = () => {
      setTimeout(() => window.location.reload(), 400);
    };

    this.swUpdate.activateUpdate().then(doReload).catch(doReload);
  }

  dismiss(): void {
    this.hasUpdate.set(false);
  }
}
