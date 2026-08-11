import {
  Component,
  HostListener,
  OnInit,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationHubService } from '../../../core/services/notification-hub.service';
import { ChatHubService } from '../../../core/services/chat-hub.service';
import { MessageService } from '../../../core/services/message.service';
import { UserService } from '../../../core/services/user.service';
import { AvatarComponent } from '../avatar/avatar.component';
import { TimeAgoPipe } from '../../pipes/time-ago.pipe';
import { TruncatePipe } from '../../pipes/truncate.pipe';
import { Conversation } from '../../../core/models/message.models';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    FormsModule,
    AvatarComponent,
    TimeAgoPipe,
    TruncatePipe,
  ],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly notificationHubService = inject(NotificationHubService);
  private readonly chatHubService = inject(ChatHubService);
  private readonly messageService = inject(MessageService);
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);

  currentUser = computed(() => this.authService.currentUser());
  isAdmin = computed(() => this.authService.isAdmin());

  unreadNotifications = computed(() =>
    this.notificationHubService.unreadCount(),
  );

  // Conversations để hiển thị trong messenger dropdown
  conversations = signal<Conversation[]>([]);
  isLoadingConversations = signal(false);

  // Tổng unread messages từ conversations
  unreadMessages = computed(() => {
    return this.conversations().reduce(
      (sum, c) => sum + (c.unreadCount ?? 0),
      0,
    );
  });

  showMenu = signal(false);
  showMessenger = signal(false);
  isDark = signal(false);
  searchQuery = '';

  private convSub?: Subscription;

  ngOnInit(): void {
    this.isDark.set(localStorage.getItem('theme') === 'dark');
    this.notificationHubService.startConnection();
    this.notificationHubService.loadInitialCount();
    this.loadConversations();
  }

  ngOnDestroy(): void {
    this.convSub?.unsubscribe();
  }

  loadConversations(): void {
    this.isLoadingConversations.set(true);
    this.convSub = this.messageService.getConversations(1, 15).subscribe({
      next: (res) => {
        if (res.success) this.conversations.set(res.data.items);
      },
      complete: () => this.isLoadingConversations.set(false),
    });
  }

  toggleMessenger(event: Event): void {
    event.stopPropagation();
    const next = !this.showMessenger();
    this.showMessenger.set(next);
    this.showMenu.set(false);
    if (next) this.loadConversations();
  }

  closeMessenger(): void {
    this.showMessenger.set(false);
  }

  openConversation(conv: Conversation, event: Event): void {
    event.stopPropagation();
    this.closeMessenger();
    this.router.navigate(['/messages', conv.id]);
  }

  openAllMessages(event: Event): void {
    event.stopPropagation();
    this.closeMessenger();
    this.router.navigate(['/messages']);
  }

  getConversationName(conv: Conversation): string {
    if (conv.isGroup) return conv.groupName ?? 'Nhóm';
    const me = this.currentUser();
    const other = conv.participants.find((p) => p.id !== me?.id);
    return other?.fullName ?? 'Người dùng';
  }

  getConversationAvatar(conv: Conversation): string | null {
    if (conv.isGroup) return conv.groupAvatarUrl;
    const me = this.currentUser();
    const other = conv.participants.find((p) => p.id !== me?.id);
    return other?.avatarUrl ?? null;
  }

  getLastMessagePreview(conv: Conversation): string {
    const msg = conv.lastMessage;
    if (!msg) return 'Bắt đầu cuộc trò chuyện';
    if (msg.isDeleted) return 'Tin nhắn đã bị xóa';
    if (msg.attachmentUrl && !msg.content) return '📎 File đính kèm';
    return msg.content ?? '';
  }

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.showMenu.update((v) => !v);
    this.showMessenger.set(false);
  }

  closeMenu(): void {
    this.showMenu.set(false);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.showMenu.set(false);
    this.showMessenger.set(false);
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
