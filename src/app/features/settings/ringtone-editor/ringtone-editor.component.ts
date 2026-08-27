import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';

export interface RingtoneEditorResult {
  file: File;
  startTime: number;
  endTime: number;
}

@Component({
  selector: 'app-ringtone-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ringtone-editor.component.html',
  styleUrl: './ringtone-editor.component.scss',
  animations: [
    trigger('editorFade', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(8px)' }),
        animate(
          '220ms ease-out',
          style({ opacity: 1, transform: 'translateY(0)' }),
        ),
      ]),
      transition(':leave', [
        animate(
          '150ms ease-in',
          style({ opacity: 0, transform: 'translateY(4px)' }),
        ),
      ]),
    ]),
  ],
})
export class RingtoneEditorComponent implements OnInit, OnDestroy {
  @Input({ required: true }) file!: File;
  @Output() applied = new EventEmitter<File>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('waveCanvas') waveCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('previewAudio') previewAudio!: ElementRef<HTMLAudioElement>;

  // ── Audio decode state ─────────────────────────────────────────
  isDecoding = signal(true);
  decodeError = signal<string | null>(null);
  duration = signal(0);

  // ── Range handles ──────────────────────────────────────────────
  startTime = signal(0);
  endTime = signal(0);

  // ── Playback ───────────────────────────────────────────────────
  isPlaying = signal(false);
  playProgress = signal(0); // 0–1 within selected range

  // ── Export ─────────────────────────────────────────────────────
  isExporting = signal(false);
  /** Lỗi sau khi encode WAV (ví dụ: vượt 5 MB) */
  exportError = signal<string | null>(null);
  maxClipSec = signal(114);
  /** Sample rate đầu ra WAV — mono 22050 Hz cho ringtone. */
  private readonly TARGET_SR = 22050;

  // ── Derived ────────────────────────────────────────────────────
  startPct = computed(() =>
    this.duration() > 0 ? this.startTime() / this.duration() : 0,
  );
  endPct = computed(() =>
    this.duration() > 0 ? this.endTime() / this.duration() : 1,
  );
  clipLen = computed(() => +(this.endTime() - this.startTime()).toFixed(1));

  private audioCtx!: AudioContext;
  private decodedBuffer: AudioBuffer | null = null;
  private objectUrl: string | null = null;

  // Playback plumbing
  private playSource: AudioBufferSourceNode | null = null;
  private playStartedAt: number = 0;
  private playOffsetSec: number = 0;
  private rafId: number = 0;

  // Drag plumbing
  private dragging: 'start' | 'end' | null = null;
  private readonly _onMouseMove = this._dragMove.bind(this);
  private readonly _onMouseUp = this._dragEnd.bind(this);
  private readonly _onTouchMove = this._touchMove.bind(this);
  private readonly _onTouchEnd = this._touchEnd.bind(this);

  // Resize observer
  private resizeObs!: ResizeObserver;

  // ──────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this._decode();
  }

  ngOnDestroy(): void {
    this._stopPlayback();
    cancelAnimationFrame(this.rafId);
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    if (this.audioCtx) {
      void this.audioCtx.close();
    }
    this.resizeObs?.disconnect();
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('touchmove', this._onTouchMove);
    window.removeEventListener('touchend', this._onTouchEnd);
  }

  // ── Decode ────────────────────────────────────────────────────
  private async _decode(): Promise<void> {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
      }
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      const ab = await this.file.arrayBuffer();
      this.decodedBuffer = await this.audioCtx.decodeAudioData(ab);
      const dur = this.decodedBuffer.duration;
      this.duration.set(dur);

      const maxSec = Math.floor(
        (4.8 * 1024 * 1024 - 44) / (this.TARGET_SR * 1 * 2),
      );
      this.maxClipSec.set(Math.max(maxSec, 5));

      this.startTime.set(0);
      this.endTime.set(Math.min(dur, this.maxClipSec()));
      this.isDecoding.set(false);

      // Setup preview <audio>
      this.objectUrl = URL.createObjectURL(this.file);

      // Draw after view is ready
      setTimeout(() => {
        this._drawWaveform();
        this._initResize();
      }, 60);
    } catch {
      this.isDecoding.set(false);
      this.decodeError.set(
        'Không đọc được file audio. Thử lại với định dạng khác.',
      );
    }
  }

  // ── Waveform ─────────────────────────────────────────────────
  private _drawWaveform(): void {
    const canvas = this.waveCanvas?.nativeElement;
    if (!canvas || !this.decodedBuffer) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(rect.width, 300);
    const H = Math.max(rect.height, 80);

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const data = this.decodedBuffer.getChannelData(0);
    const samples = W * 2;
    const step = Math.floor(data.length / samples);
    const midY = H / 2;
    const maxAmp = midY * 0.85;

    // Background
    ctx.clearRect(0, 0, W, H);

    // Draw bars
    const startPx = this.startPct() * W;
    const endPx = this.endPct() * W;

    for (let i = 0; i < samples; i++) {
      const px = (i / samples) * W;
      const amp = this._rms(data, i * step, step) * maxAmp;
      const inRange = px >= startPx && px <= endPx;

      ctx.fillStyle = inRange
        ? 'rgba(255,77,61,0.85)'
        : 'rgba(255,255,255,0.12)';
      ctx.fillRect(px, midY - amp, 1.5, amp * 2);
    }

    // Start handle line
    ctx.strokeStyle = '#ff4d3d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startPx, 0);
    ctx.lineTo(startPx, H);
    ctx.stroke();

    // End handle line
    ctx.strokeStyle = '#ff4d3d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(endPx, 0);
    ctx.lineTo(endPx, H);
    ctx.stroke();

    // Progress line (playback)
    if (this.isPlaying()) {
      const progressPx = startPx + this.playProgress() * (endPx - startPx);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(progressPx, 0);
      ctx.lineTo(progressPx, H);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private _rms(data: Float32Array, offset: number, step: number): number {
    let sum = 0;
    const end = Math.min(offset + step, data.length);
    for (let i = offset; i < end; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / (end - offset));
  }

  private _initResize(): void {
    const canvas = this.waveCanvas?.nativeElement;
    if (!canvas) return;
    this.resizeObs = new ResizeObserver(() => this._drawWaveform());
    this.resizeObs.observe(canvas.parentElement!);
  }

  // ── Drag handles ─────────────────────────────────────────────
  onHandleMouseDown(event: MouseEvent, which: 'start' | 'end'): void {
    event.preventDefault();
    this.dragging = which;
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  onHandleTouchStart(event: TouchEvent, which: 'start' | 'end'): void {
    this.dragging = which;
    window.addEventListener('touchmove', this._onTouchMove, { passive: false });
    window.addEventListener('touchend', this._onTouchEnd);
  }

  private _dragMove(e: MouseEvent): void {
    this._applyDrag(e.clientX);
  }

  private _dragEnd(): void {
    this.dragging = null;
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
  }

  private _touchMove(e: TouchEvent): void {
    e.preventDefault();
    if (e.touches.length) this._applyDrag(e.touches[0].clientX);
  }

  private _touchEnd(): void {
    this.dragging = null;
    window.removeEventListener('touchmove', this._onTouchMove);
    window.removeEventListener('touchend', this._onTouchEnd);
  }

  private _applyDrag(clientX: number): void {
    const canvas = this.waveCanvas?.nativeElement;
    if (!canvas || !this.dragging) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const t = ratio * this.duration();
    const MIN_GAP = 1; // min 1 second clip

    if (this.dragging === 'start') {
      // Khi kéo start, đảm bảo clip không ngắn hơn MIN_GAP
      this.startTime.set(Math.min(t, this.endTime() - MIN_GAP));
    } else {
      // Khi kéo end, clamp để WAV output không vượt 4.8 MB
      const maxEnd = this.startTime() + this.maxClipSec();
      this.endTime.set(
        Math.max(Math.min(t, maxEnd), this.startTime() + MIN_GAP),
      );
    }
    this._drawWaveform();
  }

  // Canvas click to scrub
  onCanvasClick(event: MouseEvent): void {
    const canvas = this.waveCanvas?.nativeElement;
    if (!canvas || !this.duration()) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const t = ratio * this.duration();

    // Move closest handle
    const dStart = Math.abs(t - this.startTime());
    const dEnd = Math.abs(t - this.endTime());
    if (dStart <= dEnd) {
      this.startTime.set(Math.min(t, this.endTime() - 1));
    } else {
      this.endTime.set(Math.max(t, this.startTime() + 1));
    }
    this._drawWaveform();
  }

  // ── Playback ─────────────────────────────────────────────────
  togglePlay(): void {
    if (this.isPlaying()) {
      this._stopPlayback();
    } else {
      this._startPlayback();
    }
  }

  private _startPlayback(): void {
    if (!this.decodedBuffer || !this.audioCtx) return;
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

    const src = this.audioCtx.createBufferSource();
    src.buffer = this.decodedBuffer;
    src.connect(this.audioCtx.destination);

    const startSec = this.startTime();
    const endSec = this.endTime();
    const duration = endSec - startSec;

    src.start(0, startSec, duration);
    src.onended = () => {
      this.isPlaying.set(false);
      this.playProgress.set(0);
      cancelAnimationFrame(this.rafId);
      this._drawWaveform();
    };

    this.playSource = src;
    this.playStartedAt = this.audioCtx.currentTime;
    this.playOffsetSec = 0;
    this.isPlaying.set(true);
    this._tickProgress();
  }

  private _stopPlayback(): void {
    try {
      this.playSource?.stop();
    } catch {}
    this.playSource = null;
    this.isPlaying.set(false);
    this.playProgress.set(0);
    cancelAnimationFrame(this.rafId);
    this._drawWaveform();
  }

  private _tickProgress(): void {
    const elapsed = this.audioCtx.currentTime - this.playStartedAt;
    const clipLen = this.endTime() - this.startTime();
    const progress = Math.min(elapsed / clipLen, 1);
    this.playProgress.set(progress);
    this._drawWaveform();

    if (progress < 1) {
      this.rafId = requestAnimationFrame(() => this._tickProgress());
    }
  }

  async applyTrim(): Promise<void> {
    if (!this.decodedBuffer) return;

    const clipDuration = this.endTime() - this.startTime();
    if (clipDuration < 1) return;

    this.applied.emit(this.file);
  }

  cancel(): void {
    this._stopPlayback();
    this.cancelled.emit();
  }

  // ── WAV encoder ──────────────────────────────────────────────
  private _encodeWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const numSamples = buffer.length;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = numSamples * numChannels * (bitsPerSample / 8);
    const buf = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buf);

    const writeStr = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++)
        view.setUint8(offset + i, s.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let s = 0; s < numSamples; s++) {
      for (let c = 0; c < numChannels; c++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(c)[s]));
        view.setInt16(
          offset,
          sample < 0 ? sample * 0x8000 : sample * 0x7fff,
          true,
        );
        offset += 2;
      }
    }

    return new Blob([buf], { type: 'audio/wav' });
  }

  // ── Template helpers ─────────────────────────────────────────
  formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
