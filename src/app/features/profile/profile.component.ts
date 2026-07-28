import {
  Component,
  AfterViewInit,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  CommonModule,
  DecimalPipe,
  DatePipe,
  SlicePipe,
} from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { UserService } from '../../core/services/user.service';
import { PostService } from '../../core/services/post.service';
import { AuthService } from '../../core/services/auth.service';
import { FriendService } from '../../core/services/friend.service';
import { MessageService } from '../../core/services/message.service';
import { ToastService } from '../../core/services/toast.service';

import { UserProfile } from '../../core/models/user.models';
import { Post, PostMedia } from '../../core/models/post.models';
import { FriendListItem } from '../../core/models/friend.models';
import { FriendshipStatus } from '../../core/models/user.models';
import { PostCardComponent } from '../../shared/components/post-card/post-card.component';

import gsap from 'gsap';

type TabKey = 'posts' | 'photos' | 'friends' | 'about';
type FriendStatusStr = 'none' | 'pending' | 'received' | 'friend';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    DecimalPipe,
    DatePipe,
    SlicePipe,
    RouterLink,
    PostCardComponent,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('sentinel') sentinelRef!: ElementRef<HTMLElement>;
  @ViewChild('coverRef') coverRef!: ElementRef<HTMLElement>;
  @ViewChild('infoRef') infoRef!: ElementRef<HTMLElement>;

  private readonly userService = inject(UserService);
  private readonly postService = inject(PostService);
  private readonly authService = inject(AuthService);
  private readonly friendService = inject(FriendService);
  private readonly messageService = inject(MessageService);
  private readonly toastService = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  profile = signal<UserProfile | null>(null);
  posts = signal<Post[]>([]);
  friends = signal<FriendListItem[]>([]);
  isLoadingProfile = signal(true);
  isLoadingPosts = signal(false);
  isLoadingMorePosts = signal(false);
  isLoadingFriends = signal(false);
  isFriendLoading = signal(false);
  activeTab = signal<TabKey>('posts');

  // Pagination
  private postsPage = 1;
  private postsHasMore = true;
  private currentUserId = '';

  // GSAP
  gsapReady = false;
  private ctx!: gsap.Context;
  private io?: IntersectionObserver;

  isMyProfile = computed(
    () => this.profile()?.id === this.authService.currentUser()?.id,
  );

  joinedYear = computed(() => {
    const d = this.profile()?.createdAt;
    return d ? new Date(d).getFullYear() : '';
  });

  /** Flat list of all image media from posts */
  photos = computed<PostMedia[]>(() =>
    this.posts()
      .flatMap((p) => p.mediaFiles.filter((m) => m.mediaType === 0)) // 0 = Image
      .slice(0, 60),
  );

  photoCount = computed(() => this.photos().length);

  /** First 6 friends for sidebar preview */
  friendsPreview = computed(() => this.friends().slice(0, 6));

  friendStatus = computed((): FriendStatusStr => {
    switch (this.profile()?.friendshipStatus) {
      case FriendshipStatus.Friends:
        return 'friend';
      case FriendshipStatus.Pending:
        return 'received'; // they sent to us
      case FriendshipStatus.SentRequest:
        return 'pending'; // we sent to them
      default:
        return 'none';
    }
  });

  ngOnInit(): void {
    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const id = params['id'] as string;
        this.currentUserId = id;
        this.resetState();
        this.loadProfile(id);
        this.loadPosts(id, true);
        this.loadFriends(id);
      });
  }

  ngAfterViewInit(): void {
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    if (!prefersReduced) {
      this.gsapReady = true;
      this.cdr.markForCheck();

      this.ctx = gsap.context(() => {
        // Page entrance
        gsap.from('.pf-cover-section', {
          opacity: 0,
          duration: 0.5,
          ease: 'power2.out',
        });

        gsap.from('.pf-info-section', {
          y: 24,
          opacity: 0,
          duration: 0.55,
          ease: 'power3.out',
          delay: 0.1,
          clearProps: 'all',
        });

        gsap.from('.pf-tabs-bar', {
          y: 12,
          opacity: 0,
          duration: 0.45,
          ease: 'power3.out',
          delay: 0.2,
          clearProps: 'all',
        });
      });
    }

    this.setupIntersectionObserver();
  }

  ngOnDestroy(): void {
    this.ctx?.revert();
    this.io?.disconnect();
  }

  private setupIntersectionObserver(): void {
    if (!this.sentinelRef) return;

    this.io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          entry.isIntersecting &&
          !this.isLoadingMorePosts() &&
          this.postsHasMore &&
          this.activeTab() === 'posts'
        ) {
          this.loadMorePosts();
        }
      },
      { rootMargin: '200px' },
    );

    this.io.observe(this.sentinelRef.nativeElement);
  }

  private resetState(): void {
    this.profile.set(null);
    this.posts.set([]);
    this.friends.set([]);
    this.postsPage = 1;
    this.postsHasMore = true;
    this.isLoadingProfile.set(true);
  }

  loadProfile(id: string): void {
    this.userService.getProfile(id).subscribe({
      next: (res) => this.profile.set(res.data),
      error: (err) => {
        if (err.status === 404) this.router.navigate(['/home']);
      },
      complete: () => {
        this.isLoadingProfile.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  loadPosts(id: string, initial = false): void {
    if (initial) {
      this.isLoadingPosts.set(true);
      this.postsPage = 1;
    }
    this.postService.getUserPosts(id, this.postsPage, 10).subscribe({
      next: (res) => {
        if (initial) {
          this.posts.set(res.data.items);
        } else {
          this.posts.update((prev) => [...prev, ...res.data.items]);
        }
        this.postsHasMore = res.data.page < res.data.totalPages;
      },
      complete: () => {
        this.isLoadingPosts.set(false);
        this.isLoadingMorePosts.set(false);
        this.cdr.markForCheck();

        // Animate new posts in
        const prefersReduced = window.matchMedia(
          '(prefers-reduced-motion: reduce)',
        ).matches;
        if (!prefersReduced && !initial) {
          gsap.from('.pf-posts-col app-post-card:last-child', {
            y: 16,
            opacity: 0,
            duration: 0.35,
            ease: 'power2.out',
            clearProps: 'all',
          });
        }
      },
    });
  }

  private loadMorePosts(): void {
    if (!this.postsHasMore || this.isLoadingMorePosts()) return;
    this.postsPage++;
    this.isLoadingMorePosts.set(true);
    this.loadPosts(this.currentUserId, false);
  }

  loadFriends(id: string): void {
    this.isLoadingFriends.set(true);
    this.friendService.getFriends(1, 20).subscribe({
      next: (res) => this.friends.set(res.data.items),
      error: () => this.friends.set([]),
      complete: () => {
        this.isLoadingFriends.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  setTab(tab: TabKey): void {
    this.activeTab.set(tab);
    this.cdr.markForCheck();

    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (!prefersReduced) {
      const panelMap: Record<TabKey, string> = {
        posts: '#pf-panel-posts',
        photos: '.pf-photos-panel',
        friends: '.pf-friends-panel',
        about: '.pf-about-panel',
      };
      const sel = panelMap[tab];
      // Slight delay to let Angular render the panel
      setTimeout(() => {
        const el = document.querySelector(sel);
        if (el) {
          gsap.from(el, {
            y: 10,
            opacity: 0,
            duration: 0.3,
            ease: 'power2.out',
            clearProps: 'all',
          });
        }
      }, 16);
    }
  }

  onPostDeleted(postId: string): void {
    this.posts.update((list) => list.filter((p) => p.id !== postId));
    this.cdr.markForCheck();
  }

  onPostUpdated(post: Post): void {
    this.posts.update((list) => list.map((p) => (p.id === post.id ? post : p)));
    this.cdr.markForCheck();
  }

  openPhoto(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  onEditProfile(): void {
    this.router.navigate(['/settings']);
  }

  onMessage(): void {
    const profileId = this.profile()?.id;
    if (!profileId) return;
    this.messageService.createOrGetConversation([profileId]).subscribe({
      next: (res) => {
        if (res.success) this.router.navigate(['/messages', res.data.id]);
      },
      error: () => this.toastService.error('Không thể mở tin nhắn'),
    });
  }

  onAddFriend(): void {
    const id = this.profile()?.id;
    if (!id) return;
    this.isFriendLoading.set(true);
    this.friendService.sendRequest(id).subscribe({
      next: () =>
        this.profile.update((p) =>
          p ? { ...p, friendshipStatus: FriendshipStatus.SentRequest } : p,
        ),
      error: () => this.toastService.error('Không thể gửi lời mời'),
      complete: () => {
        this.isFriendLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  onCancelRequest(): void {
    const id = this.profile()?.id;
    if (!id) return;
    this.isFriendLoading.set(true);
    this.friendService.unfriend(id).subscribe({
      next: () =>
        this.profile.update((p) =>
          p ? { ...p, friendshipStatus: FriendshipStatus.None } : p,
        ),
      error: () => this.toastService.error('Không thể hủy lời mời'),
      complete: () => {
        this.isFriendLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  onAcceptFriend(): void {
    const profileId = this.profile()?.id;
    if (!profileId) return;
    this.isFriendLoading.set(true);
    this.friendService.getPendingRequests(1, 50).subscribe({
      next: (res) => {
        const request = res.data?.items?.find((r) => r.sender.id === profileId);
        if (!request) {
          this.toastService.error('Không tìm thấy lời mời kết bạn');
          this.isFriendLoading.set(false);
          return;
        }
        this.friendService.acceptRequest(request.requestId).subscribe({
          next: () =>
            this.profile.update((p) =>
              p ? { ...p, friendshipStatus: FriendshipStatus.Friends } : p,
            ),
          error: () => this.toastService.error('Không thể chấp nhận kết bạn'),
          complete: () => {
            this.isFriendLoading.set(false);
            this.cdr.markForCheck();
          },
        });
      },
      error: () => {
        this.toastService.error('Không thể tải lời mời');
        this.isFriendLoading.set(false);
      },
    });
  }

  onUnfriend(): void {
    const id = this.profile()?.id;
    if (!id) return;
    this.isFriendLoading.set(true);
    this.friendService.unfriend(id).subscribe({
      next: () =>
        this.profile.update((p) =>
          p ? { ...p, friendshipStatus: FriendshipStatus.None } : p,
        ),
      error: () => this.toastService.error('Không thể hủy kết bạn'),
      complete: () => {
        this.isFriendLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  onAvatarChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.userService.updateAvatar(file).subscribe({
      next: (res) => {
        this.profile.update((p) => (p ? { ...p, avatarUrl: res.data } : p));
        this.toastService.success('Cập nhật ảnh đại diện thành công');
        this.cdr.markForCheck();
      },
      error: () => this.toastService.error('Không thể cập nhật ảnh đại diện'),
    });
    (event.target as HTMLInputElement).value = '';
  }

  onCoverChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.userService.updateCover(file).subscribe({
      next: (res) => {
        this.profile.update((p) => (p ? { ...p, coverPhotoUrl: res.data } : p));
        this.toastService.success('Cập nhật ảnh bìa thành công');
        this.cdr.markForCheck();
      },
      error: () => this.toastService.error('Không thể cập nhật ảnh bìa'),
    });
    (event.target as HTMLInputElement).value = '';
  }
}
