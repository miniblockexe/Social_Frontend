import {
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  RouterLink,
  RouterLinkActive,
  Router,
  NavigationEnd,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationHubService } from '../../../core/services/notification-hub.service';
import { ChatHubService } from '../../../core/services/chat-hub.service';
import { AvatarComponent } from '../avatar/avatar.component';

@Component({
  selector: 'app-mobile-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, AvatarComponent],
  templateUrl: './mobile-nav.component.html',
  styleUrl: './mobile-nav.component.scss',
})
export class MobileNavComponent {
  private readonly authService = inject(AuthService);
  private readonly notificationHubService = inject(NotificationHubService);
  private readonly chatHubService = inject(ChatHubService);
  private readonly router = inject(Router);

  currentUser = computed(() => this.authService.currentUser());
  isAdmin = computed(() => this.authService.isAdmin());

  unreadNotifications = computed(() =>
    this.notificationHubService.unreadCount(),
  );
  unreadMessages = computed(() => this.chatHubService.totalUnread());

  showMore = signal(false);

  // Ẩn bottom nav khi đang trong conversation cụ thể (/messages/:id)
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  isInConversation = computed(() => {
    const url = this.currentUrl();
    // /messages/:id — có segment thứ 3 (id)
    return /^\/messages\/[^/]+/.test(url);
  });

  toggleMore(): void {
    this.showMore.update((v) => !v);
  }

  closeAll(): void {
    this.showMore.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeAll();
  }

  onLogout(): void {
    this.closeAll();
    this.authService.logout();
  }
}
