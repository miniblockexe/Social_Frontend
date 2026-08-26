import {
  Injectable,
  inject,
  signal,
  OnDestroy,
  NgZone,
  effect,
} from '@angular/core';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';
import { ChatHubService } from './chat-hub.service';

export type CallState =
  | 'idle'
  | 'calling' // mình đang gọi đi, chờ đối phương bắt
  | 'receiving' // có cuộc gọi đến, chưa bắt máy
  | 'connected' // đang trong cuộc gọi
  | 'ended';

export interface CallSession {
  conversationId: string;
  peerId: string;
  peerName: string;
  peerAvatar: string | null;
  mode: 'audio' | 'video';
}

const SIGNALING_URL = environment.signalingUrl;

// Cloudflare TURN — lấy credential tại dash.cloudflare.com > Calls
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  // {
  //   urls: 'turn:turn.cloudflare.com:3478',
  //   username: 'YOUR_TURN_USERNAME',
  //   credential: 'YOUR_TURN_CREDENTIAL',
  // },
];

@Injectable({ providedIn: 'root' })
export class WebRtcService implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly chatHubService = inject(ChatHubService);
  private callTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly ngZone = inject(NgZone);

  // State
  callState = signal<CallState>('idle');
  session = signal<CallSession | null>(null);
  localStream = signal<MediaStream | null>(null);
  remoteStream = signal<MediaStream | null>(null);
  isMuted = signal(false);
  isCameraOff = signal(false);

  constructor() {
    // Khi caller huỷ/timeout → callee cleanup giao diện gọi đến
    effect(
      () => {
        const cancelled = this.chatHubService.callCancelled();
        if (!cancelled) return;

        // Reset ngay để tránh trigger lại ở lần gọi sau
        this.chatHubService.callCancelled.set(null);

        const sess = this.session();
        const state = this.callState();
        console.log('[WebRtc] callCancelled effect', {
          cancelled,
          state,
          sessConvId: sess?.conversationId,
        });

        // Chỉ cleanup nếu đang nhận đúng cuộc gọi này
        if (
          state === 'receiving' &&
          sess?.conversationId === cancelled.conversationId
        ) {
          this.cleanup();
        }
      },
      { allowSignalWrites: true },
    );
  }

  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private cleanupTimeout: ReturnType<typeof setTimeout> | null = null;

  // Callback để component hiển thị incoming call UI
  onIncomingCall?: (session: CallSession) => void;

  // ─── Public API ───────────────────────────────────────────────

  /** Gọi đi */
  async startCall(
    conversationId: string,
    peerId: string,
    peerName: string,
    peerAvatar: string | null,
    mode: 'audio' | 'video',
  ): Promise<void> {
    if (this.callState() !== 'idle' && this.callState() !== 'ended') return;
    if (this.pc || this.ws) return;

    const sess: CallSession = {
      conversationId,
      peerId,
      peerName,
      peerAvatar,
      mode,
    };
    this.session.set(sess);
    this.callState.set('calling');
    this.startRingtone('outgoing');

    this.callTimeout = setTimeout(() => {
      if (this.callState() === 'calling') {
        this.endCall();
      }
    }, 60000);

    await this.chatHubService.callInvite(conversationId, mode);

    await this.connectSignaling(conversationId);
    await this.initLocalStream(mode);
    await this.createOffer();
  }

  async answerCall(): Promise<void> {
    await this.stopRingtone();
    const sess = this.session();
    if (!sess || this.callState() !== 'receiving') return;

    this.callState.set('connected');
    // Chờ AudioContext release device trước khi getUserMedia
    await new Promise((r) => setTimeout(r, 300));
    await this.initLocalStream(sess.mode);

    for (const c of this.pendingCandidates) {
      await this.pc?.addIceCandidate(new RTCIceCandidate(c));
    }
    this.pendingCandidates = [];

    if (this.pc && this.pc.remoteDescription) {
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.sendSignal({ type: 'answer', sdp: answer.sdp });
    }
  }

  async connectSignalingForIncoming(conversationId: string): Promise<void> {
    await this.connectSignaling(conversationId);
  }

  /** Từ chối / kết thúc cuộc gọi */
  endCall(): void {
    const sess = this.session();
    if (
      sess &&
      (this.callState() === 'calling' || this.callState() === 'receiving')
    ) {
      // Báo từ chối qua SignalR
      this.chatHubService.callDeclined(sess.conversationId);
    }
    this.sendSignal({ type: 'end-call' });
    this.cleanup();
  }

  /** Toggle mute mic */
  toggleMute(): void {
    const stream = this.localStream();
    if (!stream) return;
    const muted = !this.isMuted();
    stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
    this.isMuted.set(muted);
  }

  /** Toggle camera (chỉ video call) */
  toggleCamera(): void {
    const stream = this.localStream();
    if (!stream) return;
    const cameraOff = !this.isCameraOff();
    stream.getVideoTracks().forEach((t) => (t.enabled = !cameraOff));
    this.isCameraOff.set(cameraOff);
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  // ─── Signaling ────────────────────────────────────────────────

  public async connectSignaling(conversationId: string): Promise<void> {
    const userId = this.authService.currentUser()?.id ?? '';
    if (!userId)
      throw new Error('User not authenticated — cannot connect signaling');

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const url = `${SIGNALING_URL}/ws/${conversationId}?userId=${userId}`;

    this.ws = new WebSocket(url);

    this.ws.onmessage = (event) => this.handleSignal(JSON.parse(event.data));
    this.ws.onclose = () => {
      this.ngZone.run(() => {
        if (
          this.callState() === 'connected' ||
          this.callState() === 'calling'
        ) {
          this.cleanup();
        }
      });
    };

    await new Promise<void>((resolve, reject) => {
      if (!this.ws) return reject();
      const ws = this.ws;
      ws.onopen = () => {
        if (this.ws !== ws) {
          resolve();
          return;
        }
        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
        resolve();
      };
      ws.onerror = () => {
        // Nếu ws đã bị thay (do cleanup/reconnect) thì không throw
        if (this.ws !== ws) {
          resolve();
          return;
        }
        reject(new Error('Signaling connect failed'));
      };
    });
  }

  private sendSignal(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private async handleSignal(msg: Record<string, unknown>): Promise<void> {
    switch (msg['type']) {
      case 'peer-joined':
        // Peer kia đã vào phòng — nếu mình đang calling thì tạo offer
        if (this.callState() === 'calling' && !this.pc) {
          await this.createOffer();
        }
        break;

      case 'offer': {
        // Nhận cuộc gọi đến
        const sess = this.session();
        if (!sess) break;

        this.createPeerConnection();
        await this.pc!.setRemoteDescription(
          new RTCSessionDescription({
            type: 'offer',
            sdp: msg['sdp'] as string,
          }),
        );

        if (this.callState() === 'idle' || this.callState() === 'receiving') {
          this.stopRingtone();
          this.callState.set('receiving');
          this.startRingtone('incoming');
          this.onIncomingCall?.(sess);
        }
        break;
      }

      case 'answer':
        this.stopRingtone();
        if (this.pc) {
          await this.pc.setRemoteDescription(
            new RTCSessionDescription({
              type: 'answer',
              sdp: msg['sdp'] as string,
            }),
          );
          this.callState.set('connected');
        }
        break;

      case 'ice-candidate':
        if (this.pc?.remoteDescription) {
          await this.pc.addIceCandidate(
            new RTCIceCandidate(msg['candidate'] as RTCIceCandidateInit),
          );
        } else {
          this.pendingCandidates.push(msg['candidate'] as RTCIceCandidateInit);
        }
        break;

      case 'peer-left':
      case 'end-call':
        this.cleanup();
        break;
    }
  }

  // ─── WebRTC ───────────────────────────────────────────────────

  private createPeerConnection(): void {
    if (this.pc) return;

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.sendSignal({
          type: 'ice-candidate',
          candidate: candidate.toJSON(),
        });
      }
    };

    this.pc.ontrack = (event) => {
      this.ngZone.run(() => {
        let remote = this.remoteStream();
        if (!remote) {
          remote = new MediaStream();
          this.remoteStream.set(remote);
        }
        const alreadyAdded = remote
          .getTracks()
          .find((t) => t.id === event.track.id);
        if (!alreadyAdded) {
          remote.addTrack(event.track);
        }
        this.remoteStream.set(remote);
      });
    };

    this.pc.onconnectionstatechange = () => {
      if (
        this.pc?.connectionState === 'disconnected' ||
        this.pc?.connectionState === 'failed'
      ) {
        this.cleanup();
      }
      if (this.pc?.connectionState === 'connected') {
        this.callState.set('connected');
      }
    };

    // Gắn local tracks vào peer connection
    const stream = this.localStream();
    if (stream) {
      stream.getTracks().forEach((t) => this.pc!.addTrack(t, stream));
    }
  }

  private async initLocalStream(mode: 'audio' | 'video'): Promise<void> {
    // Stop track cũ nếu còn (tránh double-acquire)
    this.localStream()
      ?.getTracks()
      .forEach((t) => t.stop());
    this.localStream.set(null);

    const doGetUserMedia = () =>
      navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: mode === 'video' ? { width: 1280, height: 720 } : false,
      });

    try {
      let stream: MediaStream;
      try {
        stream = await doGetUserMedia();
      } catch (firstErr: unknown) {
        const firstName = firstErr instanceof DOMException ? firstErr.name : '';
        if (
          firstName === 'NotReadableError' ||
          firstName === 'TrackStartError'
        ) {
          // Device chưa kịp release — retry sau 500ms
          await new Promise((r) => setTimeout(r, 500));
          stream = await doGetUserMedia();
        } else {
          throw firstErr;
        }
      }
      this.localStream.set(stream);

      // Nếu PeerConnection đã có, thêm tracks vào
      if (this.pc) {
        stream.getTracks().forEach((t) => this.pc!.addTrack(t, stream));
      }
    } catch (err: unknown) {
      const name = err instanceof DOMException ? err.name : '';

      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        throw new Error(
          mode === 'video'
            ? 'PERMISSION_DENIED_VIDEO'
            : 'PERMISSION_DENIED_AUDIO',
        );
      }

      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        throw new Error(
          mode === 'video'
            ? 'Không tìm thấy camera hoặc microphone trên thiết bị này'
            : 'Không tìm thấy microphone trên thiết bị này',
        );
      }

      if (name === 'NotReadableError' || name === 'TrackStartError') {
        throw new Error(
          'Thiết bị đang được ứng dụng khác sử dụng, vui lòng đóng lại và thử lại',
        );
      }

      throw new Error(
        mode === 'video'
          ? 'Không thể truy cập camera/microphone'
          : 'Không thể truy cập microphone',
      );
    }
  }

  private async createOffer(): Promise<void> {
    this.createPeerConnection();

    const offer = await this.pc!.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: this.session()?.mode === 'video',
    });
    await this.pc!.setLocalDescription(offer);
    this.sendSignal({ type: 'offer', sdp: offer.sdp });
  }

  // ─── Cleanup ──────────────────────────────────────────────────

  private cleanup(): void {
    this.stopRingtone();
    if (this.callTimeout) {
      clearTimeout(this.callTimeout);
      this.callTimeout = null;
    }
    this.localStream()
      ?.getTracks()
      .forEach((t) => t.stop());
    this.pc?.close();

    // Null trước khi close để onclose/onerror không trigger cleanup lại
    const ws = this.ws;
    this.ws = null;
    ws?.close();

    this.pc = null;
    this.pendingCandidates = [];

    this.localStream.set(null);
    this.remoteStream.set(null);
    this.isMuted.set(false);
    this.isCameraOff.set(false);
    this.callState.set('ended');
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    // Reset về idle sau 1.5s để hiển thị "Cuộc gọi đã kết thúc"
    if (this.cleanupTimeout) clearTimeout(this.cleanupTimeout);
    this.cleanupTimeout = setTimeout(() => {
      this.cleanupTimeout = null;
      this.callState.set('idle');
      this.session.set(null);
    }, 1500);
  }
  private ringtoneCtx: AudioContext | null = null;
  private ringtoneInterval: ReturnType<typeof setInterval> | null = null;
  private ringtoneAudio: HTMLAudioElement | null = null;

  customRingtoneUrl: string | null = null;

  private startRingtone(type: 'outgoing' | 'incoming'): void {
    this.stopRingtone();

    // Nhạc chuông tuỳ chỉnh chỉ dùng khi có người gọi đến
    if (type === 'incoming' && this.customRingtoneUrl) {
      const audio = new Audio(this.customRingtoneUrl);
      audio.loop = true;
      audio.volume = 0.7;
      audio.play().catch(() => this._startOscillatorRingtone(type));
      this.ringtoneAudio = audio;
      return;
    }

    this._startOscillatorRingtone(type);
  }

  private _startOscillatorRingtone(type: 'outgoing' | 'incoming'): void {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.value = 0.3;
    gain.connect(ctx.destination);

    const playBeep = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };

    if (type === 'incoming') {
      const play = () => {
        playBeep(880, 0, 0.3);
        playBeep(880, 0.4, 0.3);
      };
      play();
      this.ringtoneInterval = setInterval(play, 2000);
    } else {
      const play = () => playBeep(440, 0, 1.2);
      play();
      this.ringtoneInterval = setInterval(play, 3000);
    }

    this.ringtoneCtx = ctx;
  }

  private async stopRingtone(): Promise<void> {
    if (this.ringtoneAudio) {
      this.ringtoneAudio.pause();
      this.ringtoneAudio.src = '';
      this.ringtoneAudio = null;
    }
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
    if (this.ringtoneCtx) {
      await this.ringtoneCtx.close();
      this.ringtoneCtx = null;
    }
  }
}
