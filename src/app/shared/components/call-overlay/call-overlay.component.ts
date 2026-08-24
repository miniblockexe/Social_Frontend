import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { WebRtcService } from '../../../core/services/webrtc.service';

@Component({
  selector: 'app-call-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './call-overlay.component.html',
  styleUrls: ['./call-overlay.component.scss'],
})
export class CallOverlayComponent implements OnInit, OnDestroy {
  readonly webRtcService: WebRtcService = inject(WebRtcService);

  @ViewChild('localVideo') localVideoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideoRef?: ElementRef<HTMLVideoElement>;

  callDuration = signal(0);
  private durationInterval?: ReturnType<typeof setInterval>;

  isVisible = computed(() => this.webRtcService.callState() !== 'idle');

  isVideo = computed(() => this.webRtcService.session()?.mode === 'video');

  callStateLabel = computed(() => {
    switch (this.webRtcService.callState()) {
      case 'calling':
        return 'Đang gọi...';
      case 'receiving':
        return 'Cuộc gọi đến';
      case 'connected':
        return this.formatDuration(this.callDuration());
      case 'ended':
        return 'Cuộc gọi đã kết thúc';
      default:
        return '';
    }
  });

  constructor() {
    // Gắn video stream vào element khi có
    effect(() => {
      const local = this.webRtcService.localStream();
      if (local && this.localVideoRef?.nativeElement) {
        this.localVideoRef.nativeElement.srcObject = local;
      }
    });

    effect(() => {
      const remote = this.webRtcService.remoteStream();
      if (remote && this.remoteVideoRef?.nativeElement) {
        this.remoteVideoRef.nativeElement.srcObject = remote;
      }
    });

    // Bắt đầu đếm thời gian khi connected
    effect(() => {
      if (this.webRtcService.callState() === 'connected') {
        this.startDurationTimer();
      } else {
        this.stopDurationTimer();
        this.callDuration.set(0);
      }
    });
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.stopDurationTimer();
  }

  onAnswer(): void {
    this.webRtcService.answerCall();
  }

  onDecline(): void {
    this.webRtcService.endCall();
  }

  onEndCall(): void {
    this.webRtcService.endCall();
  }

  onToggleMute(): void {
    this.webRtcService.toggleMute();
  }

  onToggleCamera(): void {
    this.webRtcService.toggleCamera();
  }

  private startDurationTimer(): void {
    this.stopDurationTimer();
    this.durationInterval = setInterval(() => {
      this.callDuration.update((v) => v + 1);
    }, 1000);
  }

  private stopDurationTimer(): void {
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = undefined;
    }
  }

  private formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
}
