import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'videoTime', standalone: true, pure: true })
export class VideoTimePipe implements PipeTransform {
  transform(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
