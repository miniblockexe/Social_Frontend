import { Injectable, inject, signal } from '@angular/core';
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

@Injectable({ providedIn: 'root' })
export class ChatHubService {
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);

  private connection: HubConnection | null = null;
  private activeConversationId = signal<string | null>(null);

  messages = signal<Map<string, Message[]>>(new Map());
  typingUsers = signal<Map<string, string[]>>(new Map());
  connectionState = signal<ConnectionState>('disconnected');

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
      // normalize seenByUserIds lowercase để nhất quán với MessageSeen handler
      const normalizedMsg: Message = {
        ...msg,
        seenByUserIds: msg.seenByUserIds.map((id) => id.toLowerCase()),
      };
      this.messages.update((map) => {
        const updated = new Map(map);
        const list = [
          ...(updated.get(normalizedMsg.conversationId) ?? []),
          normalizedMsg,
        ];
        updated.set(normalizedMsg.conversationId, list);
        return updated;
      });

      if (this.activeConversationId() === msg.conversationId) {
        this.markSeen(msg.conversationId);
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
        // normalize Guid sang lowercase trước khi so sánh
        // BE List<Guid> serialize lowercase, nhưng userId từ JWT claim có thể
        // trả về bất kỳ casing nào → toLowerCase() đảm bảo luôn khớp
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
  }

  async sendMessage(conversationId: string, content: string): Promise<void> {
    await this.connection?.invoke('SendMessage', { conversationId, content });
  }

  async markSeen(conversationId: string): Promise<void> {
    await this.connection?.invoke('MarkSeen', conversationId);
  }

  async sendTyping(conversationId: string, isTyping: boolean): Promise<void> {
    await this.connection?.invoke('SendTyping', conversationId, isTyping);
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.connection?.invoke('DeleteMessage', messageId);
  }

  setActiveConversation(id: string): void {
    this.activeConversationId.set(id);
  }

  getMessagesForConversation(convId: string): Message[] {
    return this.messages().get(convId) ?? [];
  }

  loadInitialMessages(convId: string, messages: Message[]): void {
    // normalize seenByUserIds lowercase khi load từ HTTP
    // để nhất quán với data đến từ SignalR
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
}
