import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MessageService } from '../../core/services/message.service';
import { ChatHubService } from '../../core/services/chat-hub.service';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { GifService } from '../../core/services/gif.service';
import { ToastService } from '../../core/services/toast.service';
import {
  Conversation,
  Message,
  SharedPostPreviewDto,
} from '../../core/models/message.models';
import { UserSearchResult } from '../../core/models/user.models';
import { GifItem } from '../../core/models/gif.models';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { TimeAgoPipe } from '../../shared/pipes/time-ago.pipe';
import { TruncatePipe } from '../../shared/pipes/truncate.pipe';
import { LinkifyPipe } from '../../shared/pipes/linkify.pipe';

declare const gsap: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(targets: any, vars: Record<string, unknown>): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fromTo(
    targets: any,
    fromVars: Record<string, unknown>,
    toVars: Record<string, unknown>,
  ): void;
  timeline(vars?: Record<string, unknown>): {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from(
      targets: any,
      vars: Record<string, unknown>,
      position?: string | number,
    ): unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    to(
      targets: any,
      vars: Record<string, unknown>,
      position?: string | number,
    ): unknown;
  };
  matchMedia(breakpoints: Record<string, () => void>): void;
};

export interface MessageVM {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  content: string | null;
  mediaUrl: string | null;
  createdAt: string;
  isRead: boolean;
  isAi: boolean;
  sharedPost?: SharedPostPreviewDto;
}

export interface MessageGroup {
  date: string;
  messages: MessageVM[];
}

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AvatarComponent,
    LoadingSpinnerComponent,
    TimeAgoPipe,
    TruncatePipe,
    RouterLink,
    LinkifyPipe,
  ],
  templateUrl: './messages.component.html',
  styleUrl: './messages.component.scss',
})
export class MessagesComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly messageService = inject(MessageService);
  private readonly chatHubService = inject(ChatHubService);
  private readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly gifService = inject(GifService);
  private readonly toastService = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elRef = inject(ElementRef<HTMLElement>);

  @ViewChild('messagesArea') messagesAreaRef?: ElementRef<HTMLElement>;
  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;

  conversations = signal<Conversation[]>([]);
  activeConversation = signal<Conversation | null>(null);
  rawMessages = signal<Message[]>([]);
  isLoadingConversations = signal(false);
  isLoadingMessages = signal(false);
  isLoadingMoreMessages = signal(false);
  hasMoreMessages = signal(false);
  isSending = signal(false);
  isTyping = signal(false);
  isSendingFile = signal(false);

  // Dialog tạo conversation mới
  showNewConvDialog = signal(false);
  newConvSearch = '';
  newConvResults = signal<UserSearchResult[]>([]);
  isSearchingUsers = signal(false);
  isCreatingConv = signal(false);
  newConvSearchTimeout: ReturnType<typeof setTimeout> | null = null;

  // [(ngModel)] bindings
  searchQuery = '';
  messageText = '';

  typingTimeout: ReturnType<typeof setTimeout> | null = null;

  currentUser = computed(() => this.authService.currentUser());
  currentUserId = computed(() => this.currentUser()?.id ?? '');

  filteredConversations = computed(() => {
    const q = this.searchQuery.toLowerCase();
    if (!q) return this.conversations();
    return this.conversations().filter((c) =>
      this.getConversationName(c).toLowerCase().includes(q),
    );
  });

  messageGroups = computed<MessageGroup[]>(() => {
    const msgs = this.rawMessages();
    const groups: MessageGroup[] = [];
    let currentDate = '';

    for (const msg of msgs) {
      const date = new Date(msg.createdAt).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      if (date !== currentDate) {
        currentDate = date;
        groups.push({ date, messages: [] });
      }
      groups[groups.length - 1].messages.push(this.toVM(msg));
    }
    return groups;
  });

  constructor() {
    effect(() => {
      const activeId = this.activeConversation()?.id;
      if (!activeId) return;
      const allMessages = this.chatHubService.messages();
      const updated = allMessages.get(activeId) ?? [];
      untracked(() => this.rawMessages.set([...updated]));
    });
  }

  ngOnInit(): void {
    this.chatHubService.startConnection();
    this.loadConversations();

    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const id = params['id'] as string | undefined;
        if (id) this.openConversation(id);
      });
  }

  ngAfterViewInit(): void {
    this.runEntranceAnimation();
  }

  ngOnDestroy(): void {
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    if (this.newConvSearchTimeout) clearTimeout(this.newConvSearchTimeout);
    this.chatHubService.setActiveConversation(null);
  }

  private runEntranceAnimation(): void {
    // Respect prefers-reduced-motion
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;

    // Guard: GSAP may not be loaded yet (CDN async)
    if (typeof gsap === 'undefined') return;

    const host = this.elRef.nativeElement as HTMLElement;

    // Mark host ready — CSS keeps elements visible by default
    host.classList.add('gsap-ready');

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    // Sidebar slides in from left
    tl.from(
      host.querySelector('.msg-sidebar'),
      { x: -24, opacity: 0, duration: 0.55 },
      0,
    );

    // Chat window fades in slightly delayed
    tl.from(
      host.querySelector('.msg-chat-window'),
      { opacity: 0, duration: 0.45 },
      0.15,
    );

    // Sidebar header elements stagger
    tl.from(
      host.querySelectorAll('.msg-sidebar-title, .msg-icon-btn'),
      { y: 10, opacity: 0, duration: 0.4, stagger: 0.06 },
      0.2,
    );
  }

  loadConversations(): void {
    this.isLoadingConversations.set(true);
    this.messageService.getConversations().subscribe({
      next: (res) => this.conversations.set(res.data.items),
      complete: () => this.isLoadingConversations.set(false),
    });
  }

  openConversation(conversationId: string): void {
    const existing = this.conversations().find((c) => c.id === conversationId);
    if (existing) {
      this.activeConversation.set(existing);
      this.loadMessages(conversationId);
      this.chatHubService.setActiveConversation(conversationId);
      this.conversations.update((list) =>
        list.map((c) =>
          c.id === conversationId ? { ...c, unreadCount: 0 } : c,
        ),
      );
      this.router.navigate(['/messages', conversationId]);
    } else {
      this.messageService.getConversations().subscribe({
        next: (res) => {
          const conv = res.data.items.find((c) => c.id === conversationId);
          if (conv) {
            this.conversations.set(res.data.items);
            this.activeConversation.set(conv);
            this.loadMessages(conversationId);
            this.chatHubService.setActiveConversation(conversationId);
            this.conversations.update((list) =>
              list.map((c) =>
                c.id === conversationId ? { ...c, unreadCount: 0 } : c,
              ),
            );
            this.router.navigate(['/messages', conversationId]);
          }
        },
      });
    }
  }

  closeConversation(): void {
    this.activeConversation.set(null);
    this.rawMessages.set([]);
    this.chatHubService.setActiveConversation(null);
    this.router.navigate(['/messages']);
  }

  onNewConversation(): void {
    this.showNewConvDialog.set(true);
    this.newConvSearch = '';
    this.newConvResults.set([]);
  }

  closeNewConvDialog(): void {
    this.showNewConvDialog.set(false);
    this.newConvSearch = '';
    this.newConvResults.set([]);
    if (this.newConvSearchTimeout) clearTimeout(this.newConvSearchTimeout);
  }

  onNewConvSearchInput(): void {
    if (this.newConvSearchTimeout) clearTimeout(this.newConvSearchTimeout);
    const q = this.newConvSearch.trim();
    if (q.length < 2) {
      this.newConvResults.set([]);
      return;
    }

    this.newConvSearchTimeout = setTimeout(() => {
      this.isSearchingUsers.set(true);
      this.userService.searchUsers(q, 1, 10).subscribe({
        next: (res) => {
          if (res.success) {
            const filtered = res.data.items.filter(
              (u) => u.id !== this.currentUser()?.id,
            );
            this.newConvResults.set(filtered);
          }
        },
        complete: () => this.isSearchingUsers.set(false),
      });
    }, 400);
  }

  startConversation(user: UserSearchResult): void {
    if (this.isCreatingConv()) return;
    this.isCreatingConv.set(true);
    this.messageService.createOrGetConversation([user.id]).subscribe({
      next: (res) => {
        if (res.success) {
          this.closeNewConvDialog();
          const exists = this.conversations().some((c) => c.id === res.data.id);
          if (!exists) {
            this.conversations.update((list) => [res.data, ...list]);
          }
          this.openConversation(res.data.id);
        }
      },
      error: () => this.toastService.error('Không thể tạo cuộc trò chuyện'),
      complete: () => this.isCreatingConv.set(false),
    });
  }

  loadMessages(conversationId: string): void {
    this.isLoadingMessages.set(true);
    this.rawMessages.set([]);
    this.messageService.getMessages(conversationId).subscribe({
      next: (res) => {
        const ordered = [...res.data.items].reverse();
        this.rawMessages.set(ordered);
        this.chatHubService.upsertMessages(conversationId, ordered);
        this.chatHubService.markSeen(conversationId);
      },
      complete: () => {
        this.isLoadingMessages.set(false);
        // Scroll to bottom after messages load
        setTimeout(() => this.scrollToBottom(), 60);
      },
    });
  }

  loadMoreMessages(): void {
    this.toastService.info('Đã tải tất cả tin nhắn');
  }

  sendMessage(): void {
    const text = this.messageText.trim();
    if (!text || !this.activeConversation()) return;

    const convId = this.activeConversation()!.id;
    const me = this.currentUser();

    // Optimistic update
    if (me) {
      const tempMsg: Message = {
        id: `temp-${Date.now()}`,
        conversationId: convId,
        content: text,
        isAI: false,
        attachmentUrl: null,
        attachmentType: null,
        createdAt: new Date().toISOString(),
        isDeleted: false,
        sender: {
          id: me.id,
          username: me.username,
          fullName: me.fullName,
          avatarUrl: me.avatarUrl,
          role: me.role,
        },
        seenByUserIds: [me.id.toLowerCase()],
      };
      this.rawMessages.update((list) => [...list, tempMsg]);
    }

    this.isSending.set(true);
    this.chatHubService.sendMessage(convId, text);
    this.messageText = '';
    this.clearTyping();
    setTimeout(() => {
      this.isSending.set(false);
      this.scrollToBottom();
    }, 300);
  }

  onTyping(): void {
    if (!this.activeConversation()) return;
    this.chatHubService.sendTyping(this.activeConversation()!.id, true);
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.chatHubService.sendTyping(this.activeConversation()!.id, false);
    }, 2000);
  }

  triggerFileInput(): void {
    this.fileInputRef?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.activeConversation()) return;

    const convId = this.activeConversation()!.id;
    const MAX_BYTES = 50 * 1024 * 1024; // 50MB — khớp BE MaxAttachmentBytes
    if (file.size > MAX_BYTES) {
      this.toastService.error('File không được vượt quá 50MB');
      input.value = '';
      return;
    }

    this.isSendingFile.set(true);
    this.messageService.sendMessage(convId, '', file).subscribe({
      next: (res) => {
        if (res.success) {
          const msgs = this.chatHubService.getMessagesForConversation(convId);
          this.chatHubService.upsertMessages(convId, [...msgs, res.data]);
          this.chatHubService.notifyMessageSent(res.data);
          setTimeout(() => this.scrollToBottom(), 60);
        }
      },
      error: () => this.toastService.error('Không thể gửi file'),
      complete: () => this.isSendingFile.set(false),
    });
    input.value = '';
  }

  toggleEmoji(): void {
    this.toastService.info('Tính năng emoji đang phát triển');
  }

  getConversationName(conv: Conversation): string {
    if (conv.isGroup) return conv.groupName ?? 'Nhóm';
    const other = conv.participants.find(
      (p) => p.id !== this.currentUser()?.id,
    );
    return other?.fullName ?? 'Người dùng';
  }

  getConversationAvatar(conv: Conversation): string | null {
    if (conv.isGroup) return conv.groupAvatarUrl;
    const other = conv.participants.find(
      (p) => p.id !== this.currentUser()?.id,
    );
    return other?.avatarUrl ?? null;
  }

  isOnline(conv: Conversation): boolean {
    // Stub — tích hợp presence hub sau
    return false;
  }

  getLastSeen(conv: Conversation): string {
    return conv.lastMessageAt ?? new Date().toISOString();
  }

  private scrollToBottom(): void {
    const el = this.messagesAreaRef?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  private toVM(msg: Message): MessageVM {
    return {
      id: msg.id,
      senderId: msg.sender.id,
      senderName: msg.sender.fullName,
      senderAvatar: msg.sender.avatarUrl ?? null,
      content: msg.content,
      mediaUrl: msg.attachmentUrl ?? null,
      createdAt: msg.createdAt,
      isRead: msg.seenByUserIds.length > 1,
      isAi: msg.isAI,
      sharedPost: msg.sharedPost,
    };
  }

  private clearTyping(): void {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
    if (this.activeConversation()) {
      this.chatHubService.sendTyping(this.activeConversation()!.id, false);
    }
  }
}
