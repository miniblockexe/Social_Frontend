import { Injectable, inject, signal } from '@angular/core';
import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';
import { HUB_NOTIFY } from '../constants/api.constants';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import { ToastService } from './toast.service';
import { Notification } from '../models/notification.models';

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

// Khớp BE: NotificationCountDto
interface NotificationCountDto {
  unreadCount: number;
  totalCount: number;
}

@Injectable({ providedIn: 'root' })
export class NotificationHubService {
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);
  private readonly toastService = inject(ToastService);

  private connection: HubConnection | null = null;

  unreadCount = signal<number>(0);
  notifications = signal<Notification[]>([]);
  connectionState = signal<ConnectionState>('disconnected');

  async startConnection(): Promise<void> {
    if (this.connection?.state === HubConnectionState.Connected) return;

    this.connectionState.set('connecting');

    this.connection = new HubConnectionBuilder()
      .withUrl(HUB_NOTIFY, {
        accessTokenFactory: () => this.authService.getToken() ?? '',
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .configureLogging(LogLevel.Warning)
      .build();

    this.registerEventHandlers();

    try {
      await this.connection.start();
      this.connectionState.set('connected');
      this.loadInitialCount();
    } catch {
      this.connectionState.set('disconnected');
    }
  }

  async stopConnection(): Promise<void> {
    await this.connection?.stop();
    this.connectionState.set('disconnected');
  }

  private registerEventHandlers(): void {
    if (!this.connection) return;

    this.connection.on('ReceiveNotification', (notification: Notification) => {
      this.notifications.update((list) => [notification, ...list]);
      this.unreadCount.update((c) => c + 1);
      this.toastService.info(notification.content);
    });

    // BE push NotificationCountDto object { unreadCount, totalCount }
    // không phải number trực tiếp
    this.connection.on(
      'UpdateNotificationCount',
      (dto: NotificationCountDto) => {
        this.unreadCount.set(dto.unreadCount);
      },
    );
  }

  async markRead(ids: string[]): Promise<void> {
    await this.connection?.invoke('MarkRead', ids);
    this.unreadCount.update((c) => Math.max(0, c - ids.length));
  }

  loadInitialCount(): void {
    this.notificationService.getUnreadCount().subscribe({
      next: (res) => {
        if (res.success) {
          this.unreadCount.set(res.data.unreadCount);
        }
      },
    });
  }
}
