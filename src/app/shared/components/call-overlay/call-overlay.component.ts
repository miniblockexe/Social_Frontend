import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { WebRtcService } from '../../../core/services/webrtc.service';
import gsap from 'gsap';
import { Draggable } from 'gsap/Draggable';

gsap.registerPlugin(Draggable);

const BP_TABLET = 640;
const BP_DESKTOP = 1024;

@Component({
  selector: 'app-call-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './call-overlay.component.html',
  styleUrls: ['./call-overlay.component.scss'],
})
export class CallOverlayComponent implements OnInit, OnDestroy {
  readonly webRtcService: WebRtcService = inject(WebRtcService);

  // ── Element refs ─────────────────────────────────────────────
  @ViewChild('overlayEl') private overlayRef!: ElementRef<HTMLElement>;
  @ViewChild('localVideo') private localVideoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo')
  private remoteVideoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('pipContainer') private pipRef?: ElementRef<HTMLElement>;
  @ViewChild('incomingEl') private incomingRef?: ElementRef<HTMLElement>;
  @ViewChild('topbarEl') private topbarRef?: ElementRef<HTMLElement>;
  @ViewChild('controlsEl') private controlsRef?: ElementRef<HTMLElement>;
  @ViewChild('endedEl') private endedRef?: ElementRef<HTMLElement>;

  callDuration = signal(0);
  private durationInterval?: ReturnType<typeof setInterval>;
  private draggableInstance?: any;
  private resizeObserver?: ResizeObserver;
  private ctx?: any;

  isVisible = computed(() => this.webRtcService.callState() !== 'idle');

  isVideo = computed(() => this.webRtcService.session()?.mode === 'video');

  peerInitials = computed(() => {
    const name = this.webRtcService.session()?.peerName ?? '';
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('');
  });

  callAriaLabel = computed(() => {
    const state = this.webRtcService.callState();
    const name = this.webRtcService.session()?.peerName ?? 'Người gọi';
    switch (state) {
      case 'receiving':
        return `Cuộc gọi đến từ ${name}`;
      case 'calling':
        return `Đang gọi ${name}`;
      case 'connected':
        return `Đang trong cuộc gọi với ${name}`;
      case 'ended':
        return 'Cuộc gọi đã kết thúc';
      default:
        return 'Cuộc gọi';
    }
  });

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
    effect(() => {
      const stream = this.webRtcService.localStream();
      if (stream && this.localVideoRef?.nativeElement) {
        this.localVideoRef.nativeElement.srcObject = stream;
      }
    });

    effect(() => {
      const stream = this.webRtcService.remoteStream();
      if (stream && this.remoteVideoRef?.nativeElement) {
        this.remoteVideoRef.nativeElement.srcObject = stream;
      }
    });

    effect(
      () => {
        const state = this.webRtcService.callState();

        if (state === 'connected') {
          if (!this.durationInterval) {
            this.callDuration.set(0);
            this.startDurationTimer();
          }
        } else {
          this.stopDurationTimer();
          this.callDuration.set(0);
        }
      },
      { allowSignalWrites: true },
    );

    afterNextRender(() => {
      this.setupGsapContext();
    });
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.stopDurationTimer();
    this.ctx?.revert();
    this.draggableInstance?.forEach((d: any) => d.kill());
    this.resizeObserver?.disconnect();
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
    this.animateButtonPress('#btn-mute');
  }

  onToggleCamera(): void {
    this.webRtcService.toggleCamera();
    this.animateButtonPress('#btn-cam');

    if (this.pipRef?.nativeElement) {
      const pip = this.pipRef.nativeElement;
      gsap.to(pip, {
        opacity: this.webRtcService.isCameraOff() ? 0.35 : 1,
        duration: 0.25,
        ease: 'power2.out',
      });
    }
  }

  private setupGsapContext(): void {
    this.ctx?.revert();
    this.ctx = gsap.context(() => {
      const overlay = this.overlayRef?.nativeElement;
      if (overlay) {
        gsap.from(overlay, {
          opacity: 0,
          scale: 0.97,
          y: 10,
          duration: 0.35,
          ease: 'power3.out',
        });
      }

      const incoming = this.incomingRef?.nativeElement;
      if (incoming) {
        gsap.from(incoming, {
          opacity: 0,
          y: 20,
          scale: 0.96,
          duration: 0.4,
          ease: 'power3.out',
        });
      }

      const topbar = this.topbarRef?.nativeElement;
      if (topbar) {
        gsap.from(topbar, {
          opacity: 0,
          y: -16,
          duration: 0.35,
          ease: 'power3.out',
        });
      }

      const controls = this.controlsRef?.nativeElement;
      if (controls) {
        gsap.from(controls, {
          opacity: 0,
          y: 24,
          duration: 0.4,
          delay: 0.08,
          ease: 'power3.out',
        });
      }

      const ended = this.endedRef?.nativeElement;
      if (ended) {
        gsap.from(ended, {
          opacity: 0,
          y: -10,
          duration: 0.3,
          ease: 'power2.out',
        });
      }

      this.initPip();
    }, this.overlayRef?.nativeElement);
  }

  private initPip(): void {
    const pip = this.pipRef?.nativeElement;
    if (!pip) return;

    gsap.from(pip, {
      opacity: 0,
      scale: 0.7,
      duration: 0.45,
      delay: 0.18,
      ease: 'back.out(1.5)',
    });

    if (typeof Draggable !== 'undefined') {
      this.draggableInstance?.forEach((d: any) => d.kill());
      this.draggableInstance = Draggable.create(pip, {
        bounds: pip.parentElement,
        edgeResistance: 0.65,
        inertia: true,
        cursor: 'grab',
        activeCursor: 'grabbing',
        onDragEnd(this: any) {
          const parent = pip.parentElement;
          if (!parent) return;
          const pr = parent.getBoundingClientRect();
          const pr2 = pip.getBoundingClientRect();
          const cx = pr2.left + pr2.width / 2 - pr.left;
          const cy = pr2.top + pr2.height / 2 - pr.top;
          const snapX = cx < pr.width / 2 ? 16 : pr.width - pr2.width - 16;
          const snapY = cy < pr.height / 2 ? 16 : pr.height - pr2.height - 108;
          gsap.to(pip, {
            x: snapX - parseFloat(pip.style.left || '0'),
            y: 0,
            duration: 0.35,
            ease: 'power3.out',
          });
        },
      });
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.recalcPipSize());
    this.resizeObserver.observe(document.documentElement);
  }

  private recalcPipSize(): void {
    const pip = this.pipRef?.nativeElement;
    if (!pip) return;
    const w = window.innerWidth;

    if (w < BP_TABLET) {
      gsap.set(pip, { clearProps: 'all' });
    } else if (w < BP_DESKTOP) {
      gsap.set(pip, { clearProps: 'all' });
    } else {
      gsap.set(pip, { clearProps: 'all' });
    }

    this.draggableInstance?.[0]?.applyBounds(pip.parentElement);
  }

  private animateButtonPress(selector: string): void {
    const el = this.overlayRef?.nativeElement?.querySelector(selector);
    if (!el) return;
    gsap.from(el, { scale: 0.88, duration: 0.3, ease: 'back.out(2)' });
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
