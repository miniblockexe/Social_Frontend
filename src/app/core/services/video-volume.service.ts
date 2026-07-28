import { Injectable, signal } from '@angular/core';

/**
 * Singleton service – one instance for the whole app.
 * All PostCardComponents inject this and read/write the same signals.
 */
@Injectable({ providedIn: 'root' })
export class VideoVolumeService {
  /** 0–1, never 0 (0 is expressed as muted=true) */
  readonly volume = signal<number>(1);

  /** true = muted (default so autoplay works) */
  readonly muted = signal<boolean>(true);

  /** becomes true the first time the user clicks the volume icon */
  readonly userHasInteracted = signal<boolean>(false);

  /** Apply current state to every sp-media-video on the page */
  applyToAll(): void {
    document
      .querySelectorAll<HTMLVideoElement>('video.sp-media-video')
      .forEach((el) => {
        el.volume = this.volume();
        el.muted = this.muted();
      });
  }

  /** First click → unmute; subsequent clicks → toggle */
  toggleMute(): void {
    if (!this.userHasInteracted()) {
      this.userHasInteracted.set(true);
      this.muted.set(false);
    } else {
      this.muted.update((m) => !m);
    }
    this.applyToAll();
  }

  /** Called when the slider moves */
  setVolume(vol: number): void {
    this.userHasInteracted.set(true);
    const clamped = Math.max(0, Math.min(1, vol));
    if (clamped > 0) this.volume.set(clamped); // keep last non-zero volume
    this.muted.set(clamped === 0);
    this.applyToAll();
  }
}
