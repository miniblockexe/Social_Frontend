import { Injectable } from '@angular/core';

/**
 * Singleton – quản lý toàn bộ video đang phát trên trang.
 * Đảm bảo CHỈ 1 video phát tại một thời điểm, kể cả khi
 * video đó nằm ở card khác nhau.
 */
@Injectable({ providedIn: 'root' })
export class VideoPlayerService {
  private activeVideo: HTMLVideoElement | null = null;

  /**
   * Đăng ký một video muốn phát.
   * Tự động dừng video đang active trước đó.
   * @returns Promise<void> từ video.play()
   */
  play(video: HTMLVideoElement): Promise<void> {
    if (this.activeVideo && this.activeVideo !== video) {
      this.activeVideo.pause();
    }
    this.activeVideo = video;
    return video.play();
  }

  /**
   * Dừng một video cụ thể.
   * Nếu đây là active video thì clear active.
   */
  pause(video: HTMLVideoElement): void {
    video.pause();
    if (this.activeVideo === video) {
      this.activeVideo = null;
    }
  }

  /**
   * Gọi khi component bị destroy để tránh giữ ref thừa.
   */
  unregister(video: HTMLVideoElement): void {
    if (this.activeVideo === video) {
      this.activeVideo = null;
    }
  }

  get currentActive(): HTMLVideoElement | null {
    return this.activeVideo;
  }
}
