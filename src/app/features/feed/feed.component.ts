import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  ViewChildren,
  QueryList,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Post } from '../../core/models/post.models';
import {
  FriendRequest,
  FriendSuggestion,
} from '../../core/models/friend.models';
import { PostService } from '../../core/services/post.service';
import { FriendService } from '../../core/services/friend.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { FeedCacheService } from '../../core/services/feed-cache.service'; // THÊM
import { PostCardComponent } from '../../shared/components/post-card/post-card.component';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { CreatePostComponent } from '../../shared/components/create-post/create-post.component';
import { InfiniteScrollDirective } from '../../shared/directives/infinite-scroll.directive';
import { SkeletonCardComponent } from '../../shared/components/skeleton-card/skeleton-card.component';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

@Component({
  selector: 'app-feed',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    FormsModule,
    PostCardComponent,
    AvatarComponent,
    CreatePostComponent,
    InfiniteScrollDirective,
    SkeletonCardComponent,
  ],
  templateUrl: './feed.component.html',
  styleUrl: './feed.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('feedList') feedListRef!: ElementRef<HTMLElement>;
  @ViewChildren('postRef') postRefs!: QueryList<ElementRef<HTMLElement>>;

  private readonly postService = inject(PostService);
  private readonly friendService = inject(FriendService);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly feedCache = inject(FeedCacheService); 
  private readonly cdr = inject(ChangeDetectorRef);

  me = computed(() => this.authService.currentUser());

  posts: Post[] = [];
  isLoading = false;
  hasMore = true;
  showScrollTop = false;
  private cursorId?: string;

  pendingRequests: FriendRequest[] = [];
  isLoadingRequests = false;

  suggestions: FriendSuggestion[] = [];
  isLoadingSuggestions = false;
  sendingRequestId: string | null = null;

  readonly year = new Date().getFullYear();
  private ctx!: gsap.Context;

  navLinks = [
    {
      icon: 'fa-solid fa-house',
      label: 'Trang chủ',
      route: '/home',
      color: 'red',
    },
    {
      icon: 'fa-solid fa-user-group',
      label: 'Bạn bè',
      route: '/friends',
      color: 'blue',
    },
    {
      icon: 'fa-solid fa-envelope',
      label: 'Tin nhắn',
      route: '/messages',
      color: 'teal',
    },
    {
      icon: 'fa-solid fa-bell',
      label: 'Thông báo',
      route: '/notifications',
      color: 'amber',
    },
    {
      icon: 'fa-solid fa-users',
      label: 'Hội nhóm',
      route: '/groups',
      color: 'green',
    },
    {
      icon: 'fa-solid fa-gear',
      label: 'Cài đặt',
      route: '/settings',
      color: 'gray',
    },
  ];

  ngOnInit(): void {
    this.loadFeedWithCache();
    this.loadPendingRequestsWithCache();
    this.loadSuggestionsWithCache();
  }

  ngAfterViewInit(): void {
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    if (!prefersReduced) {
      this.ctx = gsap.context(() => {
        gsap.from('.feed-sidebar--left', {
          x: -28,
          duration: 0.6,
          ease: 'power3.out',
          clearProps: 'x',
        });
        gsap.from('.feed-sidebar--right', {
          x: 28,
          duration: 0.6,
          ease: 'power3.out',
          clearProps: 'x',
        });
        gsap.from('.feed-center', {
          y: 20,
          duration: 0.5,
          ease: 'power3.out',
          delay: 0.1,
          clearProps: 'y',
        });
        gsap.from('.feed-page-header', {
          y: -16,
          duration: 0.45,
          ease: 'power3.out',
          delay: 0.15,
          clearProps: 'y',
        });
      });
      this.setupScrollTriggers();
    }
  }

  ngOnDestroy(): void {
    ScrollTrigger.getAll().forEach((t) => t.kill());
    this.ctx?.revert();
  }

  private loadFeedWithCache(): void {
    const snap = this.feedCache.getFeed();
    if (snap) {
      this.posts = snap.posts;
      this.cursorId = snap.cursorId;
      this.hasMore = snap.hasMore;
      this.cdr.markForCheck();

      const age = Date.now() - (snap as any).cachedAt;
      if (age > 45_000) {
        this.revalidateFeedSilently();
      }
      return;
    }
    this.loadFeed();
  }

  private loadFeed(): void {
    if (this.isLoading) return;
    this.isLoading = true;
    this.cdr.markForCheck();

    this.postService.getFeed(1, 10, this.cursorId).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.posts = [...this.posts, ...res.data.items];
          this.hasMore = res.data.page < res.data.totalPages;
          const last = res.data.items.at(-1);
          if (last) this.cursorId = last.id;

          // Lưu vào cache
          this.feedCache.saveFeed(this.posts, this.cursorId, this.hasMore);
        }
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  /** Fetch trang 1 trong nền, cập nhật cache + UI nếu có dữ liệu mới */
  private revalidateFeedSilently(): void {
    this.postService.getFeed(1, 10).subscribe({
      next: (res) => {
        if (!res.success || !res.data) return;
        const fresh = res.data.items;
        const last = fresh.at(-1);
        const cursor = last?.id;
        const hasMore = res.data.page < res.data.totalPages;

        this.posts = fresh;
        this.cursorId = cursor;
        this.hasMore = hasMore;
        this.feedCache.saveFeed(fresh, cursor, hasMore);
        this.cdr.markForCheck();
      },
    });
  }

  private loadPendingRequestsWithCache(): void {
    const cached = this.feedCache.getPending();
    if (cached) {
      this.pendingRequests = cached;
      this.cdr.markForCheck();
      return;
    }
    this.isLoadingRequests = true;
    this.friendService.getPendingRequests(1, 5).subscribe({
      next: (res) => {
        if (res.success) {
          this.pendingRequests = res.data.items;
          this.feedCache.savePending(res.data.items);
        }
        this.isLoadingRequests = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingRequests = false;
        this.cdr.markForCheck();
      },
    });
  }

  private loadSuggestionsWithCache(): void {
    const cached = this.feedCache.getSuggestions();
    if (cached) {
      this.suggestions = cached;
      this.cdr.markForCheck();
      return;
    }
    this.isLoadingSuggestions = true;
    this.friendService.getSuggestions(1, 5).subscribe({
      next: (res) => {
        if (res.success) {
          this.suggestions = res.data.items;
          this.feedCache.saveSuggestions(res.data.items);
        }
        this.isLoadingSuggestions = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingSuggestions = false;
        this.cdr.markForCheck();
      },
    });
  }

  private setupScrollTriggers(): void {
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (prefersReduced) return;

    this.postRefs.changes.subscribe(() => {
      const cards = document.querySelectorAll('.feed-post-wrap:not([data-st])');
      cards.forEach((el) => {
        el.setAttribute('data-st', '1');
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: 'top 95%', once: true },
          y: 24,
          duration: 0.44,
          ease: 'power3.out',
          clearProps: 'y',
        });
      });
      ScrollTrigger.refresh();
    });
  }

  onWindowScroll(scrollY: number): void {
    this.showScrollTop = scrollY > 500;
    this.cdr.markForCheck();
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onLoadMore(): void {
    if (this.isLoading || !this.hasMore) return;
    this.loadFeed();
  }

  onPostDeleted(postId: string): void {
    this.posts = this.posts.filter((p) => p.id !== postId);
    this.feedCache.removePost(postId);
    this.cdr.markForCheck();
  }

  onPostUpdated(post: Post): void {
    this.posts = this.posts.map((p) => (p.id === post.id ? post : p));
    this.feedCache.updatePost(post);
    this.cdr.markForCheck();
  }

  onPostCreated(post: Post): void {
    this.posts = [post, ...this.posts];
    this.feedCache.prependPost(post);
    this.cdr.markForCheck();

    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (!prefersReduced) {
      requestAnimationFrame(() => {
        const firstCard = document.querySelector(
          '.feed-post-wrap:first-of-type',
        );
        if (firstCard) {
          gsap.from(firstCard, {
            y: -20,
            opacity: 0,
            duration: 0.4,
            ease: 'power3.out',
            clearProps: 'all',
          });
        }
      });
    }
  }

  onAcceptRequest(req: FriendRequest): void {
    this.friendService.acceptRequest(req.requestId).subscribe({
      next: () => {
        this.toastService.success(
          `Đã chấp nhận lời mời của ${req.sender.fullName}`,
        );
        this.pendingRequests = this.pendingRequests.filter(
          (r) => r.requestId !== req.requestId,
        );
        this.feedCache.removePending(req.requestId);
        this.cdr.markForCheck();
      },
      error: () => this.toastService.error('Không thể chấp nhận lời mời'),
    });
  }

  onRejectRequest(req: FriendRequest): void {
    this.friendService.rejectRequest(req.requestId).subscribe({
      next: () => {
        this.pendingRequests = this.pendingRequests.filter(
          (r) => r.requestId !== req.requestId,
        );
        this.feedCache.removePending(req.requestId);
        this.cdr.markForCheck();
      },
      error: () => this.toastService.error('Không thể từ chối lời mời'),
    });
  }

  onSendRequest(suggestion: FriendSuggestion): void {
    this.sendingRequestId = suggestion.user.id;
    this.friendService.sendRequest(suggestion.user.id).subscribe({
      next: () => {
        this.toastService.success(
          `Đã gửi lời mời đến ${suggestion.user.fullName}`,
        );
        this.suggestions = this.suggestions.filter(
          (s) => s.user.id !== suggestion.user.id,
        );
        this.feedCache.removeSuggestion(suggestion.user.id);
        this.sendingRequestId = null;
        this.cdr.markForCheck();
      },
      error: () => {
        this.toastService.error('Không thể gửi lời mời kết bạn');
        this.sendingRequestId = null;
        this.cdr.markForCheck();
      },
    });
  }

  trackPost(_: number, post: Post): string {
    return post.id;
  }
  trackRequest(_: number, r: FriendRequest): string {
    return r.requestId;
  }
  trackSuggestion(_: number, s: FriendSuggestion): string {
    return s.user.id;
  }
}
