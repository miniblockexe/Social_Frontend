import {
  Component,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationHubService } from '../../../core/services/notification-hub.service';
import { ChatHubService } from '../../../core/services/chat-hub.service';
import { UserService } from '../../../core/services/user.service';
import { AvatarComponent } from '../avatar/avatar.component';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    FormsModule,
    AvatarComponent,
  ],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly notificationHubService = inject(NotificationHubService);
  private readonly chatHubService = inject(ChatHubService);
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);

  currentUser = computed(() => this.authService.currentUser());
  isAdmin = computed(() => this.authService.isAdmin());

  unreadNotifications = computed(() =>
    this.notificationHubService.unreadCount(),
  );

  // Tính tổng unread messages từ conversations
  unreadMessages = computed(() => {
    const convs = this.chatHubService.messages();
    // Đếm conversations có tin nhắn chưa đọc — stub, cần integrate presence
    return 0;
  });

  showMenu = signal(false);
  isDark = signal(false);
  searchQuery = '';

  ngOnInit(): void {
    this.isDark.set(localStorage.getItem('theme') === 'dark');
    // Start hubs nếu chưa start (idempotent)
    this.notificationHubService.startConnection();
    this.notificationHubService.loadInitialCount();
  }

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.showMenu.update((v) => !v);
  }

  closeMenu(): void {
    this.showMenu.set(false);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.showMenu.set(false);
  }

  toggleDarkMode(): void {
    this.isDark.update((v) => !v);
    const theme = this.isDark() ? 'dark' : 'light';
    localStorage.setItem('theme', theme);
    document.body.setAttribute('data-bs-theme', theme);
  }

  onSearch(): void {
    const q = this.searchQuery.trim();
    if (!q) return;
    this.router.navigate(['/home'], { queryParams: { q } });
  }

  onLogout(): void {
    this.closeMenu();
    this.authService.logout();
  }
}
