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
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription, Subject, forkJoin, of } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  catchError,
} from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationHubService } from '../../../core/services/notification-hub.service';
import { ChatHubService } from '../../../core/services/chat-hub.service';
import { MessageService } from '../../../core/services/message.service';
import { UserService } from '../../../core/services/user.service';
import { PostService } from '../../../core/services/post.service';
import { AvatarComponent } from '../avatar/avatar.component';
import { TimeAgoPipe } from '../../pipes/time-ago.pipe';
import { TruncatePipe } from '../../pipes/truncate.pipe';
import { Conversation } from '../../../core/models/message.models';
import { UserSearchResult } from '../../../core/models/user.models';
import { Post, MediaType } from '../../../core/models/post.models';

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
  private readonly postService = inject(PostService);
  private readonly router = inject(Router);

  readonly MediaType = MediaType;

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
   * Merge base list với latestMessageByConv — cập nhật preview và sort
   * ngay khi có tin nhắn mới mà không cần reload HTTP.
   * Dùng latestMessageByConv (không phải incomingMessages) để bao gồm
   * cả tin nhắn do chính user gửi — incomingMessages chỉ track tin từ người khác.
   */
  conversations = computed(() => {
    const base = this.baseConversations();
    const latest = this.chatHubService.latestMessageByConv();
    if (latest.size === 0) return base;
    let merged = [...base];
    latest.forEach((inc, conversationId) => {
      const idx = merged.findIndex((c) => c.id === conversationId);
      if (idx !== -1) {
        const updated: Conversation = {
          ...merged[idx],
          lastMessageAt: inc.createdAt,
          unreadCount:
            this.chatHubService.unreadByConversation().get(conversationId) ?? 0,
          lastMessage: {
            id: '',
            conversationId,
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
    });

    // Sort theo lastMessageAt mới nhất
    return merged.sort((a, b) => {
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return tb - ta;
    });
  });

  isLoadingConversations = signal(false);

  showMenu = signal(false);
  showMessenger = signal(false);
  searchQuery = '';

  // ── Search dropdown ──────────────────────────────────────────
  showSearchDropdown = signal(false);
  searchResultUsers = signal<UserSearchResult[]>([]);
  searchResultPosts = signal<Post[]>([]);
  isSearching = signal(false);
  private searchSubject = new Subject<string>();

  private convSub?: Subscription;
  private searchSub?: Subscription;

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
    // Giữ dark mode mặc định luôn bật
    document.body.setAttribute('data-bs-theme', 'dark');

    this.notificationHubService.startConnection();
    this.notificationHubService.loadInitialCount();
    this.chatHubService.startConnection();

    this.loadConversations();

    // Search debounce pipeline
    this.searchSub = this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((q) => {
          if (q.length < 2) {
            this.searchResultUsers.set([]);
            this.searchResultPosts.set([]);
            this.showSearchDropdown.set(false);
            this.isSearching.set(false);
            return of(null);
          }
          this.isSearching.set(true);
          return forkJoin({
            users: this.userService
              .searchUsers(q, 1, 4)
              .pipe(catchError(() => of(null))),
            posts: this.postService
              .searchPosts(q, 'all', 1, 3)
              .pipe(catchError(() => of(null))),
          });
        }),
      )
      .subscribe((res) => {
        if (!res) return;
        this.searchResultUsers.set(res.users?.data?.items ?? []);
        this.searchResultPosts.set(res.posts?.data?.items ?? []);
        this.showSearchDropdown.set(true);
        this.isSearching.set(false);
      });
  }

  ngOnDestroy(): void {
    this.convSub?.unsubscribe();
    this.searchSub?.unsubscribe();
  }

  loadConversations(): void {
    this.isLoadingConversations.set(true);
    this.convSub?.unsubscribe();
    this.convSub = this.messageService.getConversations(1, 20).subscribe({
      next: (res) => {
        if (res.success) {
          this.baseConversations.set(res.data.items);
          this.chatHubService.initUnreadFromConversations(res.data.items);
        }
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
    this.showSearchDropdown.set(false);
  }

  // ── Search handlers ──────────────────────────────────────────
  onSearchInput(): void {
    this.searchSubject.next(this.searchQuery);
  }

  onSearchFocus(): void {
    if (this.searchQuery.length >= 2) {
      this.showSearchDropdown.set(true);
    }
  }

  closeSearchDropdown(): void {
    this.showSearchDropdown.set(false);
  }

  goToSearchPage(tab?: string): void {
    const q = this.searchQuery.trim();
    if (!q) return;
    this.closeSearchDropdown();
    this.router.navigate(['/search'], {
      queryParams: { q, tab: tab ?? 'all' },
    });
  }

  onSearch(): void {
    this.goToSearchPage();
  }

  getPostPreviewIcon(post: Post): string {
    const types = post.mediaFiles.map((m) => m.mediaType);
    if (types.includes(MediaType.Video)) return 'fa-solid fa-video';
    if (types.includes(MediaType.Image)) return 'fa-solid fa-image';
    return 'fa-solid fa-file-lines';
  }

  onLogout(): void {
    this.closeMenu();
    this.authService.logout();
  }
}
