import {
  Component,
  HostListener,
  OnInit,
  OnDestroy,
  computed,
  effect,
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
  readonly chatHubService = inject(ChatHubService);
  private readonly messageService = inject(MessageService);
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);

  currentUser = computed(() => this.authService.currentUser());
  isAdmin = computed(() => this.authService.isAdmin());

  unreadNotifications = computed(() =>
    this.notificationHubService.unreadCount(),
  );

  /** Badge tin nhắn = tổng unread real-time từ SignalR */
  unreadMessages = computed(() => this.chatHubService.totalUnread());

  // Conversations base (load từ HTTP)
  private baseConversations = signal<Conversation[]>([]);

  /**
   * Conversations hiển thị trong dropdown:
   * Merge base list với incomingMessages — cập nhật preview và sort
   * ngay khi có tin nhắn mới mà không cần reload HTTP.
   */
  conversations = computed(() => {
    const base = this.baseConversations();
    const incoming = this.chatHubService.incomingMessages();
    if (incoming.length === 0) return base;

    // Merge: với mỗi incoming, cập nhật lastMessage preview trên base list
    let merged = [...base];
    for (const inc of incoming) {
      const idx = merged.findIndex((c) => c.id === inc.conversationId);
      if (idx !== -1) {
        const updated: Conversation = {
          ...merged[idx],
          lastMessageAt: inc.createdAt,
          unreadCount:
            this.chatHubService
              .unreadByConversation()
              .get(inc.conversationId) ?? 0,
          lastMessage: {
            id: '',
            conversationId: inc.conversationId,
            content: inc.content,
            isAI: false,
            attachmentUrl: null,
            attachmentType: null,
            createdAt: inc.createdAt,
            isDeleted: false,
            sender: {
              id: inc.senderId,
              username: '',
              fullName: inc.senderName,
              avatarUrl: inc.senderAvatar,
              role: 0 as any,
            },
            seenByUserIds: [],
          },
        };
        merged.splice(idx, 1);
        merged = [updated, ...merged];
      }
    }
    return merged;
  });

  isLoadingConversations = signal(false);

  showMenu = signal(false);
  showMessenger = signal(false);
  isDark = signal(false);
  searchQuery = '';

  private convSub?: Subscription;

  constructor() {
    effect(() => {
      const incoming = this.chatHubService.incomingMessages();
      const base = this.baseConversations();
      const missing = incoming.some(
        (inc) => !base.find((c) => c.id === inc.conversationId),
      );
      if (missing) {
        this.loadConversations();
      }
    });
  }

  ngOnInit(): void {
    this.isDark.set(localStorage.getItem('theme') === 'dark');

    this.notificationHubService.startConnection();
    this.notificationHubService.loadInitialCount();
    this.chatHubService.startConnection();

    this.loadConversations();
  }

  ngOnDestroy(): void {
    this.convSub?.unsubscribe();
  }

  loadConversations(): void {
    this.isLoadingConversations.set(true);
    this.convSub?.unsubscribe();
    this.convSub = this.messageService.getConversations(1, 20).subscribe({
      next: (res) => {
        if (res.success) this.baseConversations.set(res.data.items);
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
    this.chatHubService.clearUnread(conv.id);
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

  /** Unread count cho conversation cụ thể (real-time từ SignalR) */
  getUnreadCount(convId: string): number {
    return this.chatHubService.unreadByConversation().get(convId) ?? 0;
  }

  /** Conversation có unread không (kết hợp DB + real-time) */
  hasUnread(conv: Conversation): boolean {
    return this.getUnreadCount(conv.id) > 0 || (conv.unreadCount ?? 0) > 0;
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
