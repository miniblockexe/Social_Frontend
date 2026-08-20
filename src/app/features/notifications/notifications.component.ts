import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  computed,
  effect,
  inject,
  signal,
  ElementRef,
  ViewChild,
  QueryList,
  ViewChildren,
  DestroyRef,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NotificationService } from '../../core/services/notification.service';
import { NotificationHubService } from '../../core/services/notification-hub.service';
import { FriendService } from '../../core/services/friend.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { TimeAgoPipe } from '../../shared/pipes/time-ago.pipe';
import {
  Notification,
  NotificationType,
} from '../../core/models/notification.models';

// Chỉ import GSAP core — không cần plugin
import { gsap } from 'gsap';

type FilterTab = 'all' | 'unread';

export interface NotificationUI extends Notification {
  message: string;
  postThumbnail?: string | null;
  isPending?: boolean;
}

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, AvatarComponent, TimeAgoPipe],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
})
export class NotificationsComponent
  implements OnInit, AfterViewInit, OnDestroy {
  private readonly notificationService = inject(NotificationService);
  private readonly notificationHubService = inject(NotificationHubService);
  private readonly friendService = inject(FriendService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('pageRef') pageRef!: ElementRef<HTMLDivElement>;
  @ViewChild('headerRef') headerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('tabsRef') tabsRef!: ElementRef<HTMLDivElement>;
  @ViewChild('listRef') listRef!: ElementRef<HTMLDivElement>;

  notifications = signal<NotificationUI[]>([]);
  isLoading = signal(false);
  isLoadingMore = signal(false);
  isMarkingAll = signal(false);
  hasMore = signal(true);
  page = signal(1);
  filterTab = signal<FilterTab>('all');

  readonly NotificationType = NotificationType;

  private gsapCtx: gsap.Context | null = null;
  private entranceTl: gsap.core.Timeline | null = null;
  private prefersReducedMotion = false;

  unreadCount = computed(() => this.notificationHubService.unreadCount());

  filteredNotifications = computed(() => {
    const nonMessage = this.notifications().filter(
      (n) => n.type !== NotificationType.Message,
    );
    if (this.filterTab() === 'unread') {
      return nonMessage.filter((n) => !n.isRead);
    }
    return nonMessage;
  });

  constructor() {
    effect(() => {
      const incoming = this.notificationHubService.notifications();
      if (incoming.length === 0) return;
      const latest = incoming[0];
      // Bỏ qua notification loại Message — tin nhắn hiển thị qua messenger dropdown
      if (latest.type === NotificationType.Message) return;
      this.notifications.update((list) => {
        if (list.some((n) => n.id === latest.id)) return list;
        const newUI = this.toUI(latest);
        // Animate item mới vào sau khi Angular render xong
        setTimeout(() => this.animateNewItem(), 50);
        return [newUI, ...list];
      });
    });
  }

  ngOnInit(): void {
    this.prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    this.loadNotifications();
    this.notificationHubService.startConnection();
  }

  ngAfterViewInit(): void {
    this.runPageEntrance();
  }

  ngOnDestroy(): void {
    this.gsapCtx?.revert();
    this.notificationHubService.stopConnection();
  }

  /** 1. Animation khung trang (Header + Tabs) - Chạy ngay khi vào trang */
  private runPageEntrance(): void {
    if (this.prefersReducedMotion) return;

    this.zone.runOutsideAngular(() => {
      const page = this.pageRef?.nativeElement;
      if (!page) return;

      this.gsapCtx = gsap.context(() => {
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

        tl.from(page, { y: 8, duration: 0.3 });
        tl.from(
          '.notif-title',
          { opacity: 0, y: 12, duration: 0.35 },
          '-=0.15',
        );
        tl.from(
          '.notif-mark-btn',
          { opacity: 0, x: 8, duration: 0.25 },
          '-=0.2',
        );
        tl.from(
          '.notif-tab',
          { opacity: 0, y: 5, duration: 0.22, stagger: 0.05 },
          '-=0.15',
        );
      }, page);
    });
  }

  animateListIn(): void {
    if (this.prefersReducedMotion) return;

    this.zone.runOutsideAngular(() => {
      setTimeout(() => {
        const items = document.querySelectorAll('.notif-item');
        if (!items.length) return;

        // Xóa sạch animation cũ nếu có
        gsap.killTweensOf(items);

        // fromTo: Ép ngay opacity: 0 tức thì trước khi Render Frame diễn ra
        gsap.fromTo(
          items,
          {
            opacity: 0,
            y: 12,
          },
          {
            opacity: 1,
            y: 0,
            duration: 0.35,
            stagger: 0.04,
            ease: 'power2.out',
            clearProps: 'all', // Trả lại style CSS gốc sau khi hoàn thành
          },
        );
      }, 0);
    });
  }

  private animateNewItem(): void {
    if (this.prefersReducedMotion) return;

    this.zone.runOutsideAngular(() => {
      const first = document.querySelector('.notif-item');
      if (!first) return;
      gsap.from(first, {
        opacity: 0,
        x: -20,
        duration: 0.4,
        ease: 'power2.out',
        clearProps: 'transform,opacity',
      });
    });
  }

  /** Animate item out khi decline friend request */
  private animateItemOut(el: Element, onComplete: () => void): void {
    if (this.prefersReducedMotion) {
      onComplete();
      return;
    }

    this.zone.runOutsideAngular(() => {
      gsap.to(el, {
        opacity: 0,
        x: 30,
        height: 0,
        paddingTop: 0,
        paddingBottom: 0,
        marginBottom: 0,
        duration: 0.3,
        ease: 'power2.in',
        onComplete,
      });
    });
  }

  /** Animate unread dot → disappear khi mark read */
  animateMarkRead(dot: HTMLElement): void {
    if (this.prefersReducedMotion) return;

    this.zone.runOutsideAngular(() => {
      gsap.to(dot, {
        scale: 0,
        opacity: 0,
        duration: 0.2,
        ease: 'power2.in',
        clearProps: 'all',
      });
    });
  }

  /** Pulse animation cho nút mark-all khi hover */
  onMarkAllHover(el: EventTarget | null, enter: boolean): void {
    if (this.prefersReducedMotion || !(el instanceof HTMLElement)) return;

    this.zone.runOutsideAngular(() => {
      gsap.to(el, {
        scale: enter ? 1.03 : 1,
        duration: 0.2,
        ease: enter ? 'power2.out' : 'power2.in',
      });
    });
  }

  loadNotifications(): void {
    this.isLoading.set(true);
    this.page.set(1);
    this.notificationService.getNotifications(1).subscribe({
      next: (res) => {
        if (res.success) {
          this.notifications.set(res.data.items.map((n) => this.toUI(n)));
          this.hasMore.set(res.data.pageNumber < res.data.totalPages);

          this.animateListIn();
        }
      },
      complete: () => this.isLoading.set(false),
    });
  }

  loadMore(): void {
    if (this.isLoadingMore()) return;
    const nextPage = this.page() + 1;
    this.isLoadingMore.set(true);
    this.notificationService.getNotifications(nextPage).subscribe({
      next: (res) => {
        if (res.success) {
          this.page.set(nextPage);
          const prevLen = this.notifications().length;
          this.notifications.update((list) => [
            ...list,
            ...res.data.items.map((n) => this.toUI(n)),
          ]);
          this.hasMore.set(res.data.pageNumber < res.data.totalPages);
          // Animate chỉ items mới load thêm
          setTimeout(() => {
            const items = document.querySelectorAll('.notif-item');
            const newItems = Array.from(items).slice(prevLen);
            if (!newItems.length) return;
            gsap.from(newItems, {
              opacity: 0,
              y: 12,
              duration: 0.35,
              stagger: 0.05,
              ease: 'power2.out',
              clearProps: 'transform,opacity',
            });
          }, 30);
        }
      },
      complete: () => this.isLoadingMore.set(false),
    });
  }

  setFilter(tab: FilterTab): void {
    this.filterTab.set(tab);
    // Re-animate list sau filter change
    setTimeout(() => this.animateListIn(), 20);
  }

  onNotifClick(notif: NotificationUI, event: Event): void {
    if (!notif.isRead) {
      const dot = (
        event.currentTarget as HTMLElement
      ).querySelector<HTMLElement>('.notif-unread-dot');
      if (dot) this.animateMarkRead(dot);
      this.notificationService.markAsRead([notif.id]).subscribe({
        next: (res) => {
          if (res.success) {
            this.notificationHubService.markRead([notif.id]);
            this.notifications.update((list) =>
              list.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)),
            );
          }
        },
      });
    }
    this.navigateToEntity(notif);
  }

  markAllRead(): void {
    this.isMarkingAll.set(true);
    this.notificationService.markAllAsRead().subscribe({
      next: (res) => {
        if (res.success) {
          // Animate tất cả unread dots ra
          if (!this.prefersReducedMotion) {
            const dots = document.querySelectorAll('.notif-unread-dot');
            gsap.to(dots, {
              scale: 0,
              opacity: 0,
              duration: 0.25,
              stagger: 0.03,
            });
          }
          this.notifications.update((list) =>
            list.map((n) => ({ ...n, isRead: true })),
          );
          this.notificationHubService.unreadCount.set(0);
        }
      },
      complete: () => this.isMarkingAll.set(false),
    });
  }

  onAcceptFriend(notif: NotificationUI): void {
    if (!notif.entityId) return;
    this.notifications.update((list) =>
      list.map((n) => (n.id === notif.id ? { ...n, isPending: true } : n)),
    );
    this.friendService.acceptRequest(notif.entityId).subscribe({
      next: () => {
        const wasUnread = !notif.isRead;
        this.notifications.update((list) =>
          list.map((n) =>
            n.id === notif.id
              ? {
                ...n,
                isPending: false,
                isRead: true,
                type: NotificationType.FriendAccepted,
              }
              : n,
          ),
        );
        if (wasUnread) {
          this.notificationHubService.markRead([notif.id]);
        }
      },
      error: () => {
        this.notifications.update((list) =>
          list.map((n) => (n.id === notif.id ? { ...n, isPending: false } : n)),
        );
      },
    });
  }

  onDeclineFriend(notif: NotificationUI, event: MouseEvent): void {
    event.stopPropagation();
    if (!notif.entityId) return;
    this.notifications.update((list) =>
      list.map((n) => (n.id === notif.id ? { ...n, isPending: true } : n)),
    );

    const itemEl = (event.target as HTMLElement).closest('.notif-item');

    this.friendService.rejectRequest(notif.entityId).subscribe({
      next: () => {
        if (itemEl) {
          this.animateItemOut(itemEl, () => {
            this.zone.run(() => {
              this.notifications.update((list) =>
                list.filter((n) => n.id !== notif.id),
              );
            });
          });
        } else {
          this.notifications.update((list) =>
            list.filter((n) => n.id !== notif.id),
          );
        }
      },
      error: () => {
        this.notifications.update((list) =>
          list.map((n) => (n.id === notif.id ? { ...n, isPending: false } : n)),
        );
      },
    });
  }

  navigateToEntity(notif: Notification): void {
    switch (notif.entityType) {
      case 'post':
        if (notif.entityId)
          this.router.navigate(['/home'], {
            queryParams: { postId: notif.entityId },
          });
        break;
      case 'friend_request':
        this.router.navigate(['/profile', notif.actor.id]);
        break;
      case 'message':
        this.router.navigate(['/messages']);
        break;
    }
  }

  getNotifIcon(type: NotificationType | string): string {
    switch (type) {
      case NotificationType.Like:
        return 'fa-solid fa-heart';
      case NotificationType.Comment:
        return 'fa-solid fa-comment';
      case NotificationType.FriendRequest:
      case NotificationType.FriendAccepted:
      case 'friend_request':
        return 'fa-solid fa-user-plus';
      case NotificationType.Message:
        return 'fa-solid fa-envelope';
      default:
        return 'fa-solid fa-bell';
    }
  }

  getNotifIconColor(type: NotificationType | string): string {
    switch (type) {
      case NotificationType.Like:
        return 'badge--like';
      case NotificationType.Comment:
        return 'badge--comment';
      case NotificationType.FriendRequest:
      case NotificationType.FriendAccepted:
      case 'friend_request':
        return 'badge--friend';
      case NotificationType.Message:
        return 'badge--message';
      default:
        return 'badge--system';
    }
  }

  getNotifText(type: NotificationType | string): string {
    switch (type) {
      case NotificationType.Like:
        return 'đã thích bài viết của bạn';
      case NotificationType.Comment:
        return 'đã bình luận bài viết của bạn';
      case NotificationType.FriendRequest:
      case 'friend_request':
        return 'đã gửi lời mời kết bạn';
      case NotificationType.FriendAccepted:
        return 'đã chấp nhận lời mời kết bạn';
      case NotificationType.Message:
        return 'đã gửi tin nhắn cho bạn';
      default:
        return 'đã tương tác với bạn';
    }
  }

  private toUI(n: Notification): NotificationUI {
    return { ...n, message: n.content, postThumbnail: null, isPending: false };
  }
}