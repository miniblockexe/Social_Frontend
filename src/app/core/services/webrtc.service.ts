import { Injectable, inject, signal, OnDestroy } from '@angular/core';
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

  // State
  callState = signal<CallState>('idle');
  session = signal<CallSession | null>(null);
  localStream = signal<MediaStream | null>(null);
  remoteStream = signal<MediaStream | null>(null);
  isMuted = signal(false);
  isCameraOff = signal(false);

  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];

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
    if (this.callState() !== 'idle') return;

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

    await this.chatHubService.callInvite(conversationId, mode);

    await this.connectSignaling(conversationId);
    await this.initLocalStream(mode);
    await this.createOffer();
  }

  /** Bắt máy khi có cuộc gọi đến */
  async answerCall(): Promise<void> {
    this.stopRingtone();
    const sess = this.session();
    if (!sess || this.callState() !== 'receiving') return;

    this.callState.set('connected');
    await this.initLocalStream(sess.mode);

    // Flush pending ICE candidates nhận được trước khi answer
    for (const c of this.pendingCandidates) {
      await this.pc?.addIceCandidate(new RTCIceCandidate(c));
    }
    this.pendingCandidates = [];
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
    const url = `${SIGNALING_URL}/ws/${conversationId}?userId=${userId}`;

    this.ws = new WebSocket(url);

    this.ws.onmessage = (event) => this.handleSignal(JSON.parse(event.data));
    this.ws.onclose = () => {
      if (this.callState() === 'connected' || this.callState() === 'calling') {
        this.cleanup();
      }
    };

    await new Promise<void>((resolve, reject) => {
      if (!this.ws) return reject();
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('Signaling connect failed'));
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
          // Trigger incoming call UI
          this.callState.set('receiving');
          this.startRingtone('incoming');
          this.onIncomingCall?.(sess);
        } else if (this.callState() === 'connected') {
          // Đã bắt máy rồi, tạo answer luôn
          const answer = await this.pc!.createAnswer();
          await this.pc!.setLocalDescription(answer);
          this.sendSignal({ type: 'answer', sdp: answer.sdp });
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
      const [stream] = event.streams;
      if (stream) this.remoteStream.set(stream);
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: mode === 'video' ? { width: 1280, height: 720 } : false,
      });
      this.localStream.set(stream);

      // Nếu PeerConnection đã có, thêm tracks vào
      if (this.pc) {
        stream.getTracks().forEach((t) => this.pc!.addTrack(t, stream));
      }
    } catch {
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
    this.localStream()
      ?.getTracks()
      .forEach((t) => t.stop());
    this.pc?.close();
    this.ws?.close();

    this.pc = null;
    this.ws = null;
    this.pendingCandidates = [];

    this.localStream.set(null);
    this.remoteStream.set(null);
    this.isMuted.set(false);
    this.isCameraOff.set(false);
    this.callState.set('ended');

    // Reset về idle sau 1.5s để hiển thị "Cuộc gọi đã kết thúc"
    setTimeout(() => {
      this.callState.set('idle');
      this.session.set(null);
    }, 1500);
  }
  private ringtoneCtx: AudioContext | null = null;
  private ringtoneInterval: ReturnType<typeof setInterval> | null = null;

  private startRingtone(type: 'outgoing' | 'incoming'): void {
    this.stopRingtone();

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

  private stopRingtone(): void {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
    if (this.ringtoneCtx) {
      this.ringtoneCtx.close();
      this.ringtoneCtx = null;
    }
  }
}
