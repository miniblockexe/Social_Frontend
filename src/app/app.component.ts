import { Component, computed, effect, inject } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { ChatHubService } from './core/services/chat-hub.service';
import { WebRtcService } from './core/services/webrtc.service';
import { AuthService } from './core/services/auth.service';
import { CallOverlayComponent } from './shared/components/call-overlay/call-overlay.component';

const NO_NAVBAR_ROUTES = ['/', '/auth/login', '/auth/register'];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, NavbarComponent, CallOverlayComponent],
  template: `
    @if (showNavbar()) {
      <app-navbar />
    }
    <router-outlet />
    <app-call-overlay />
  `,
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private readonly router = inject(Router);
  private readonly chatHubService = inject(ChatHubService);
  private readonly webRtcService = inject(WebRtcService);
  private readonly authService = inject(AuthService);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  showNavbar = computed(() => {
    const url = this.currentUrl().split('?')[0];
    return !NO_NAVBAR_ROUTES.includes(url);
  });

  constructor() {
    effect(
      () => {
        const incoming = this.chatHubService.incomingCall();
        if (!incoming) return;

        const me = this.authService.currentUser();
        if (incoming.callerId === me?.id) return;

        this.webRtcService.session.set({
          conversationId: incoming.conversationId,
          peerId: incoming.callerId,
          peerName: incoming.callerName,
          peerAvatar: incoming.callerAvatar,
          mode: incoming.mode,
        });
        this.webRtcService.callState.set('receiving');
        this.webRtcService.connectSignalingForIncoming(incoming.conversationId);
      },
      { allowSignalWrites: true },
    );
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.chatHubService.startConnection();
      }
    });
  }
}
