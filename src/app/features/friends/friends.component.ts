import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FriendService } from '../../core/services/friend.service';
import { ToastService } from '../../core/services/toast.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { FriendRequest, FriendListItem, FriendSuggestion } from '../../core/models/friend.models';

type FriendsTab = 'all' | 'requests' | 'suggestions' | 'sent';

@Component({
  selector: 'app-friends',
  standalone: true,
  imports: [CommonModule, RouterLink, AvatarComponent, LoadingSpinnerComponent],
  templateUrl: './friends.component.html',
  styleUrl: './friends.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FriendsComponent implements OnInit {
  private readonly friendService = inject(FriendService);
  private readonly toastService = inject(ToastService);

  activeTab = signal<FriendsTab>('all');

  // Bạn bè
  friends = signal<FriendListItem[]>([]);
  isLoadingFriends = signal(false);
  friendsPage = signal(1);
  hasMoreFriends = signal(true);

  // Lời mời đang chờ (nhận được)
  pendingRequests = signal<FriendRequest[]>([]);
  isLoadingPending = signal(false);
  pendingPage = signal(1);
  hasMorePending = signal(true);

  // Lời mời đã gửi
  sentRequests = signal<FriendRequest[]>([]);
  isLoadingSent = signal(false);
  sentPage = signal(1);
  hasMoreSent = signal(true);

  // Gợi ý kết bạn
  suggestions = signal<FriendSuggestion[]>([]);
  isLoadingSuggestions = signal(false);
  suggestionsPage = signal(1);
  hasMoreSuggestions = signal(true);

  ngOnInit() {
    this.loadFriends();
    this.loadPending();
  }

  setTab(tab: FriendsTab) {
    this.activeTab.set(tab);
    if (tab === 'sent' && this.sentRequests().length === 0) this.loadSent();
    if (tab === 'suggestions' && this.suggestions().length === 0) this.loadSuggestions();
  }

  // ── Danh sách bạn bè ─────────────────────────────────────────────────
  loadFriends() {
    if (this.isLoadingFriends() || !this.hasMoreFriends()) return;
    this.isLoadingFriends.set(true);
    this.friendService.getFriends(this.friendsPage(), 20).subscribe({
      next: (res) => {
        if (res.data) {
          this.friends.update((p) => [...p, ...res.data.items]);
          this.hasMoreFriends.set(
            res.data.items.length === 20 && this.friends().length < res.data.totalCount,
          );
          this.friendsPage.update((p) => p + 1);
        }
        this.isLoadingFriends.set(false);
      },
      error: () => {
        this.toastService.error('Không thể tải danh sách bạn bè.');
        this.isLoadingFriends.set(false);
      },
    });
  }

  unfriend(item: FriendListItem) {
    this.friendService.unfriend(item.user.id).subscribe({
      next: () => {
        this.toastService.success('Đã hủy kết bạn.');
        this.friends.update((list) => list.filter((f) => f.user.id !== item.user.id));
      },
      error: () => this.toastService.error('Không thể hủy kết bạn.'),
    });
  }

  // ── Lời mời đang chờ ─────────────────────────────────────────────────
  loadPending() {
    if (this.isLoadingPending() || !this.hasMorePending()) return;
    this.isLoadingPending.set(true);
    this.friendService.getPendingRequests(this.pendingPage(), 20).subscribe({
      next: (res) => {
        if (res.data) {
          this.pendingRequests.update((p) => [...p, ...res.data.items]);
          this.hasMorePending.set(
            res.data.items.length === 20 && this.pendingRequests().length < res.data.totalCount,
          );
          this.pendingPage.update((p) => p + 1);
        }
        this.isLoadingPending.set(false);
      },
      error: () => {
        this.toastService.error('Không thể tải lời mời kết bạn.');
        this.isLoadingPending.set(false);
      },
    });
  }

  acceptRequest(req: FriendRequest) {
    this.friendService.acceptRequest(req.requestId).subscribe({
      next: () => {
        this.toastService.success(`Bạn và ${req.sender.fullName} đã trở thành bạn bè.`);
        this.pendingRequests.update((list) => list.filter((r) => r.requestId !== req.requestId));
        this.friends.update((list) => [
          { user: req.sender, friendSince: new Date().toISOString(), mutualFriendsCount: 0 },
          ...list,
        ]);
      },
      error: () => this.toastService.error('Không thể chấp nhận lời mời.'),
    });
  }

  rejectRequest(req: FriendRequest) {
    this.friendService.rejectRequest(req.requestId).subscribe({
      next: () => {
        this.toastService.info('Đã từ chối lời mời kết bạn.');
        this.pendingRequests.update((list) => list.filter((r) => r.requestId !== req.requestId));
      },
      error: () => this.toastService.error('Không thể từ chối lời mời.'),
    });
  }

  // ── Lời mời đã gửi ───────────────────────────────────────────────────
  loadSent() {
    if (this.isLoadingSent() || !this.hasMoreSent()) return;
    this.isLoadingSent.set(true);
    this.friendService.getSentRequests(this.sentPage(), 20).subscribe({
      next: (res) => {
        if (res.data) {
          this.sentRequests.update((p) => [...p, ...res.data.items]);
          this.hasMoreSent.set(
            res.data.items.length === 20 && this.sentRequests().length < res.data.totalCount,
          );
          this.sentPage.update((p) => p + 1);
        }
        this.isLoadingSent.set(false);
      },
      error: () => {
        this.toastService.error('Không thể tải lời mời đã gửi.');
        this.isLoadingSent.set(false);
      },
    });
  }

  // ── Gợi ý kết bạn ────────────────────────────────────────────────────
  loadSuggestions() {
    if (this.isLoadingSuggestions() || !this.hasMoreSuggestions()) return;
    this.isLoadingSuggestions.set(true);
    this.friendService.getSuggestions(this.suggestionsPage(), 10).subscribe({
      next: (res) => {
        if (res.data) {
          this.suggestions.update((p) => [...p, ...res.data.items]);
          this.hasMoreSuggestions.set(
            res.data.items.length === 10 && this.suggestions().length < res.data.totalCount,
          );
          this.suggestionsPage.update((p) => p + 1);
        }
        this.isLoadingSuggestions.set(false);
      },
      error: () => {
        this.toastService.error('Không thể tải gợi ý kết bạn.');
        this.isLoadingSuggestions.set(false);
      },
    });
  }

  addFriend(sug: FriendSuggestion) {
    this.friendService.sendRequest(sug.user.id).subscribe({
      next: () => {
        this.toastService.success(`Đã gửi lời mời kết bạn tới ${sug.user.fullName}.`);
        this.suggestions.update((list) => list.filter((s) => s.user.id !== sug.user.id));
      },
      error: (err) =>
        this.toastService.error(err?.error?.message || 'Không thể gửi lời mời kết bạn.'),
    });
  }

  trackByUserId(_: number, item: FriendListItem) {
    return item.user.id;
  }
  trackByRequestId(_: number, item: FriendRequest) {
    return item.requestId;
  }
  trackBySuggestionId(_: number, item: FriendSuggestion) {
    return item.user.id;
  }
}