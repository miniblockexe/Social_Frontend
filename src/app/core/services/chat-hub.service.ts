import { Injectable, inject, signal, computed } from '@angular/core';
import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
} from '@microsoft/signalr';
import { HUB_CHAT } from '../constants/api.constants';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import { Message } from '../models/message.models';

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export interface IncomingMessage {
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  content: string | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ChatHubService {
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);

  private connection: HubConnection | null = null;
  private activeConversationId = signal<string | null>(null);

  messages = signal<Map<string, Message[]>>(new Map());
  typingUsers = signal<Map<string, string[]>>(new Map());
  connectionState = signal<ConnectionState>('disconnected');

  /**
   * Map<conversationId, unreadCount> — chỉ đếm tin nhắn từ người khác
   * khi conversation đó KHÔNG phải đang active.
   * Navbar dùng signal này để hiện badge.
   */
  unreadByConversation = signal<Map<string, number>>(new Map());

  /** Tổng số tin nhắn chưa đọc qua tất cả conversation. */
  totalUnread = computed(() => {
    let total = 0;
    this.unreadByConversation().forEach((count) => (total += count));
    return total;
  });

  /**
   * Danh sách tin nhắn mới đến (chỉ từ người khác, chưa đọc).
   * Navbar dùng để cập nhật unread badge và reload conv nếu thiếu.
   */
  incomingMessages = signal<IncomingMessage[]>([]);
  incomingCall = signal<{
    conversationId: string;
    callerId: string;
    callerName: string;
    callerAvatar: string | null;
    mode: 'audio' | 'video';
  } | null>(null);

  /** Caller đã huỷ/timeout — callee cần cleanup UI */
  callCancelled = signal<{ conversationId: string } | null>(null);

  latestMessageByConv = signal<Map<string, IncomingMessage>>(new Map());

  async startConnection(): Promise<void> {
    if (this.connection?.state === HubConnectionState.Connected) return;

    this.connectionState.set('connecting');

    this.connection = new HubConnectionBuilder()
      .withUrl(HUB_CHAT, {
        accessTokenFactory: () => this.authService.getToken() ?? '',
      })
      .withAutomaticReconnect()
      .build();

    this.registerEventHandlers();

    try {
      await this.connection.start();
      this.connectionState.set('connected');
    } catch {
      this.connectionState.set('disconnected');
      this.toastService.error('Không thể kết nối chat. Thử lại sau.');
    }
  }

  async stopConnection(): Promise<void> {
    await this.connection?.stop();
    this.connectionState.set('disconnected');
  }

  private registerEventHandlers(): void {
    if (!this.connection) return;

    this.connection.on('ReceiveMessage', (msg: Message) => {
      const currentUserId = this.authService.currentUser()?.id?.toLowerCase();

      // normalize seenByUserIds lowercase để nhất quán với MessageSeen handler
      const normalizedMsg: Message = {
        ...msg,
        seenByUserIds: msg.seenByUserIds.map((id) => id.toLowerCase()),
      };
      this.messages.update((map) => {
        const updated = new Map(map);
        let existing = updated.get(normalizedMsg.conversationId) ?? [];

        const isOwnMessage =
          currentUserId && msg.sender?.id?.toLowerCase() === currentUserId;

        if (isOwnMessage) {
          existing = existing.filter((m) => !m.id.startsWith('temp-'));
        }

        if (!existing.some((m) => m.id === normalizedMsg.id)) {
          existing = [...existing, normalizedMsg];
        }

        updated.set(normalizedMsg.conversationId, existing);
        return updated;
      });

      const isFromOther =
        currentUserId && msg.sender?.id?.toLowerCase() !== currentUserId;

      const isActive = this.activeConversationId() === msg.conversationId;

      const preview: IncomingMessage = {
        conversationId: msg.conversationId,
        senderId: msg.sender?.id ?? '',
        senderName: msg.sender?.fullName ?? '',
        senderAvatar: msg.sender?.avatarUrl ?? null,
        content: msg.content,
        createdAt: msg.createdAt,
      };
      this.latestMessageByConv.update((map) => {
        const updated = new Map(map);
        updated.set(msg.conversationId, preview);
        return updated;
      });

      if (isActive) {
        this.markSeen(msg.conversationId);
      } else if (isFromOther) {
        this.unreadByConversation.update((map) => {
          const updated = new Map(map);
          updated.set(
            msg.conversationId,
            (updated.get(msg.conversationId) ?? 0) + 1,
          );
          return updated;
        });

        this.incomingMessages.update((list) => {
          const filtered = list.filter(
            (m) => m.conversationId !== msg.conversationId,
          );
          return [preview, ...filtered];
        });
      }
    });

    this.connection.on(
      'MessageSeen',
      ({
        conversationId,
        userId,
      }: {
        conversationId: string;
        userId: string;
        seenAt: string;
      }) => {
        const normalizedUserId = userId.toLowerCase();
        this.messages.update((map) => {
          const updated = new Map(map);
          const list = (updated.get(conversationId) ?? []).map((m) =>
            m.seenByUserIds
              .map((id) => id.toLowerCase())
              .includes(normalizedUserId)
              ? m
              : { ...m, seenByUserIds: [...m.seenByUserIds, normalizedUserId] },
          );
          updated.set(conversationId, list);
          return updated;
        });

        const currentUserId = this.authService.currentUser()?.id?.toLowerCase();
        if (normalizedUserId === currentUserId) {
          this.clearUnread(conversationId);
        }
      },
    );

    this.connection.on(
      'UserTyping',
      ({
        conversationId,
        userId,
        isTyping,
      }: {
        conversationId: string;
        userId: string;
        isTyping: boolean;
      }) => {
        this.typingUsers.update((map) => {
          const updated = new Map(map);
          const current = updated.get(conversationId) ?? [];
          if (isTyping) {
            updated.set(
              conversationId,
              current.includes(userId) ? current : [...current, userId],
            );
          } else {
            updated.set(
              conversationId,
              current.filter((id) => id !== userId),
            );
          }
          return updated;
        });
      },
    );

    this.connection.on(
      'MessageDeleted',
      ({
        messageId,
        conversationId,
      }: {
        messageId: string;
        conversationId: string;
        deletedBy: string;
      }) => {
        this.messages.update((map) => {
          const updated = new Map(map);
          const list = (updated.get(conversationId) ?? []).map((m) =>
            m.id === messageId ? { ...m, isDeleted: true, content: null } : m,
          );
          updated.set(conversationId, list);
          return updated;
        });
      },
    );

    this.connection.on(
      'Error',
      ({ message }: { method: string; message: string }) => {
        this.toastService.error(message);
      },
    );
    this.connection.on('IncomingCall', (data) => {
      this.incomingCall.set(data);
    });

    this.connection.on('CallDeclined', (data: { conversationId: string }) => {
      // Caller huỷ hoặc timeout — báo cho WebRtcService cleanup
      console.log('[ChatHub] CallDeclined received', data);
      this.callCancelled.set({ ...data });
    });
  }

  async sendMessage(conversationId: string, content: string): Promise<void> {
    await this.connection?.invoke('SendMessage', { conversationId, content });
  }

  async markSeen(conversationId: string): Promise<void> {
    await this.connection?.invoke('MarkSeen', conversationId);
    this.clearUnread(conversationId);
  }

  async sendTyping(conversationId: string, isTyping: boolean): Promise<void> {
    await this.connection?.invoke('SendTyping', conversationId, isTyping);
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.connection?.invoke('DeleteMessage', messageId);
  }

  async callInvite(
    conversationId: string,
    mode: 'audio' | 'video',
  ): Promise<void> {
    await this.connection?.invoke('CallInvite', conversationId, mode);
  }

  async callDeclined(conversationId: string): Promise<void> {
    await this.connection?.invoke('CallDeclined', conversationId);
  }

  setActiveConversation(id: string | null): void {
    this.activeConversationId.set(id);
    if (id) this.clearUnread(id);
  }

  initUnreadFromConversations(
    conversations: Array<{ id: string; unreadCount: number }>,
  ): void {
    this.unreadByConversation.update((map) => {
      const updated = new Map(map);
      for (const conv of conversations) {
        if (!updated.has(conv.id) && conv.unreadCount > 0) {
          updated.set(conv.id, conv.unreadCount);
        }
      }
      return updated;
    });
  }

  clearUnread(conversationId: string): void {
    this.unreadByConversation.update((map) => {
      if (!map.has(conversationId)) return map;
      const updated = new Map(map);
      updated.delete(conversationId);
      return updated;
    });
    this.incomingMessages.update((list) =>
      list.filter((m) => m.conversationId !== conversationId),
    );
  }

  getMessagesForConversation(convId: string): Message[] {
    return this.messages().get(convId) ?? [];
  }

  loadInitialMessages(convId: string, messages: Message[]): void {
    const normalized = messages.map((m) => ({
      ...m,
      seenByUserIds: m.seenByUserIds.map((id) => id.toLowerCase()),
    }));
    this.messages.update((map) => {
      if (map.has(convId)) return map;
      const updated = new Map(map);
      updated.set(convId, normalized);
      return updated;
    });
  }

  notifyMessageSent(msg: Message): void {
    const preview: IncomingMessage = {
      conversationId: msg.conversationId,
      senderId: msg.sender?.id ?? '',
      senderName: msg.sender?.fullName ?? '',
      senderAvatar: msg.sender?.avatarUrl ?? null,
      content: msg.attachmentUrl ? null : msg.content,
      createdAt: msg.createdAt,
    };
    this.latestMessageByConv.update((map) => {
      const updated = new Map(map);
      updated.set(msg.conversationId, preview);
      return updated;
    });
  }

  upsertMessages(convId: string, messages: Message[]): void {
    const normalized = messages.map((m) => ({
      ...m,
      seenByUserIds: m.seenByUserIds.map((id) => id.toLowerCase()),
    }));
    this.messages.update((map) => {
      const updated = new Map(map);
      updated.set(convId, normalized);
      return updated;
    });
  }
}
