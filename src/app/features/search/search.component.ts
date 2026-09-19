import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { UserService } from '../../core/services/user.service';
import { PostService } from '../../core/services/post.service';
import { FriendService } from '../../core/services/friend.service';
import { ToastService } from '../../core/services/toast.service';
import { Post, MediaType } from '../../core/models/post.models';
import { UserSearchResult } from '../../core/models/user.models';
import { FriendshipStatus } from '../../core/models/friend.models';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { PostCardComponent } from '../../shared/components/post-card/post-card.component';

export type SearchTab = 'all' | 'people' | 'images' | 'video';

export const SEARCH_TABS: { id: SearchTab; label: string; icon: string }[] = [
  { id: 'all',    label: 'Tất cả',     icon: 'fa-solid fa-border-all' },
  { id: 'people', label: 'Người dùng', icon: 'fa-solid fa-users' },
  { id: 'images', label: 'Ảnh',        icon: 'fa-solid fa-image' },
  { id: 'video',  label: 'Video',      icon: 'fa-solid fa-video' },
];

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, AvatarComponent, PostCardComponent],
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss',
})
export class SearchComponent implements OnInit, OnDestroy {
  private readonly route   = inject(ActivatedRoute);
  private readonly router  = inject(Router);
  private readonly userSvc = inject(UserService);
  private readonly postSvc = inject(PostService);
  private readonly friendSvc = inject(FriendService);
  private readonly toastSvc  = inject(ToastService);

  readonly FriendshipStatus = FriendshipStatus;
  readonly MediaType = MediaType;
  readonly TABS = SEARCH_TABS;

  keyword    = signal('');
  activeTab  = signal<SearchTab>('all');

  users      = signal<UserSearchResult[]>([]);
  posts      = signal<Post[]>([]);
  totalUsers = signal(0);
  totalPosts = signal(0);
  userPage   = signal(1);
  postPage   = signal(1);
  hasMoreUsers = signal(false);
  hasMorePosts = signal(false);
  isLoading    = signal(false);
  isLoadingMore = signal(false);
  isSendingFriend = signal<string | null>(null);

  private routeSub?: Subscription;

  ngOnInit(): void {
    this.routeSub = this.route.queryParams.subscribe((params) => {
      const q   = (params['q'] ?? '').trim();
      const tab = (params['tab'] ?? 'all') as SearchTab;
      this.keyword.set(q);
      this.activeTab.set(tab);
      this.resetState();
      if (q.length >= 2) this.fetchResults();
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  setTab(tab: SearchTab): void {
    if (tab === this.activeTab()) return;
    this.router.navigate([], {
      queryParams: { q: this.keyword(), tab },
      queryParamsHandling: 'merge',
    });
  }

  private resetState(): void {
    this.users.set([]);
    this.posts.set([]);
    this.totalUsers.set(0);
    this.totalPosts.set(0);
    this.userPage.set(1);
    this.postPage.set(1);
    this.hasMoreUsers.set(false);
    this.hasMorePosts.set(false);
  }

  private fetchResults(): void {
    const q   = this.keyword();
    const tab = this.activeTab();
    if (q.length < 2) return;

    this.isLoading.set(true);

    const needsUsers = tab === 'all' || tab === 'people';
    const needsPosts = tab !== 'people';
    const mediaFilter = tab === 'images' ? 'image' : tab === 'video' ? 'video' : 'all';

    const users$ = needsUsers
      ? this.userSvc.searchUsers(q, this.userPage(), 8).pipe(catchError(() => of(null)))
      : of(null);

    const posts$ = needsPosts
      ? this.postSvc.searchPosts(q, mediaFilter as any, this.postPage(), 10).pipe(catchError(() => of(null)))
      : of(null);

    forkJoin({ users: users$, posts: posts$ }).subscribe({
      next: ({ users, posts }) => {
        if (users?.success) {
          this.users.set(users.data.items);
          this.totalUsers.set(users.data.totalCount);
          // hasNextPage = còn trang kế nếu pageNumber < totalPages
          this.hasMoreUsers.set(users.data.pageNumber < users.data.totalPages);
        }
        if (posts?.success) {
          this.posts.set(posts.data.items);
          this.totalPosts.set(posts.data.totalCount);
          this.hasMorePosts.set(posts.data.pageNumber < posts.data.totalPages);
        }
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  loadMorePosts(): void {
    if (!this.hasMorePosts() || this.isLoadingMore()) return;
    this.isLoadingMore.set(true);
    const nextPage    = this.postPage() + 1;
    const mediaFilter = this.activeTab() === 'images' ? 'image'
                      : this.activeTab() === 'video'  ? 'video' : 'all';

    this.postSvc.searchPosts(this.keyword(), mediaFilter as any, nextPage, 10).subscribe({
      next: (res) => {
        if (res.success) {
          this.posts.update((prev) => [...prev, ...res.data.items]);
          this.totalPosts.set(res.data.totalCount);
          this.hasMorePosts.set(res.data.pageNumber < res.data.totalPages);
          this.postPage.set(nextPage);
        }
        this.isLoadingMore.set(false);
      },
      error: () => this.isLoadingMore.set(false),
    });
  }

  loadMoreUsers(): void {
    if (!this.hasMoreUsers() || this.isLoadingMore()) return;
    this.isLoadingMore.set(true);
    const nextPage = this.userPage() + 1;

    this.userSvc.searchUsers(this.keyword(), nextPage, 8).subscribe({
      next: (res) => {
        if (res.success) {
          this.users.update((prev) => [...prev, ...res.data.items]);
          this.totalUsers.set(res.data.totalCount);
          this.hasMoreUsers.set(res.data.pageNumber < res.data.totalPages);
          this.userPage.set(nextPage);
        }
        this.isLoadingMore.set(false);
      },
      error: () => this.isLoadingMore.set(false),
    });
  }

  sendFriendRequest(user: UserSearchResult): void {
    if (this.isSendingFriend() === user.id) return;
    this.isSendingFriend.set(user.id);
    this.friendSvc.sendRequest(user.id).subscribe({
      next: () => {
        this.users.update((list) =>
          list.map((u) =>
            u.id === user.id ? { ...u, friendshipStatus: FriendshipStatus.SentRequest } : u,
          ),
        );
        this.toastSvc.success(`Đã gửi lời mời kết bạn tới ${user.fullName}`);
        this.isSendingFriend.set(null);
      },
      error: () => {
        this.toastSvc.error('Không thể gửi lời mời. Vui lòng thử lại.');
        this.isSendingFriend.set(null);
      },
    });
  }

  cancelFriendRequest(user: UserSearchResult): void {
    this.users.update((list) =>
      list.map((u) =>
        u.id === user.id ? { ...u, friendshipStatus: FriendshipStatus.None } : u,
      ),
    );
  }
}
