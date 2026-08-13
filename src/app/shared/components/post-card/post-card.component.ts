import {
  Component,
  HostListener,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChildren,
  QueryList,
  inject,
  input,
  output,
  signal,
  computed,
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PostService } from '../../../core/services/post.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { VideoVolumeService } from '../../../core/services/video-volume.service';
import { VideoPlayerService } from '../../../core/services/video-player.service';
import { Post, Comment, PostPrivacy } from '../../../core/models/post.models';
import { AvatarComponent } from '../avatar/avatar.component';
import { LoadingSpinnerComponent } from '../loading-spinner/loading-spinner.component';
import { TimeAgoPipe } from '../../pipes/time-ago.pipe';
import { VideoTimePipe } from '../../pipes/video-time.pipe';

@Component({
  selector: 'app-post-card',
  standalone: true,
  imports: [
    CommonModule,
    DecimalPipe,
    FormsModule,
    AvatarComponent,
    LoadingSpinnerComponent,
    TimeAgoPipe,
    VideoTimePipe,
    RouterLink,
  ],
  templateUrl: './post-card.component.html',
  styleUrl: './post-card.component.scss',
})
export class PostCardComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly postService = inject(PostService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);
  readonly vol = inject(VideoVolumeService);
  private readonly videoPlayer = inject(VideoPlayerService);

  post = input.required<Post>();

  postDeleted = output<string>();
  postUpdated = output<Post>();

  @ViewChildren('videoEl') videoEls!: QueryList<ElementRef<HTMLVideoElement>>;

  isLiked = signal(false);
  likeCount = signal(0);
  showComments = signal(false);
  showMenu = signal(false);
  comments = signal<Comment[]>([]);
  isLoadingComments = signal(false);
  isSubmittingComment = signal(false);
  commentPage = signal(1);
  hasMoreComments = signal(false);
  playingIndex = signal<number | null>(null);

  // Share state
  showShareMenu = signal(false);
  showSharePanel = signal(false);
  shareCaption = signal('');
  sharePrivacy = signal<PostPrivacy>(PostPrivacy.Public);
  isSharing = signal(false);
  shareCount = signal(0);
  showPrivacyDropdown = signal(false);
  readonly PostPrivacy = PostPrivacy;

  // Video controls state (per-card)
  videoTimes = signal<number[]>([]);
  videoDurations = signal<number[]>([]);

  // Lightbox
  lightboxIndex = signal<number | null>(null);

  private observers: IntersectionObserver[] = [];

  /** two-way bindable string for [(ngModel)] */
  commentText = '';

  // Expose Math to template (for Math.min in media grid)
  readonly Math = Math;

  currentUser = computed(() => this.authService.currentUser());

  private commentsLoaded = false;
  private readonly PAGE_SIZE = 10;

  ngOnInit(): void {
    this.isLiked.set(this.post().isLikedByMe);
    this.likeCount.set(this.post().likeCount);
    this.shareCount.set(this.post().shareCount ?? 0);
  }

  ngAfterViewInit(): void {
    // Khởi tạo mảng state theo số video
    const count = this.videoEls.length;
    this.videoTimes.set(new Array(count).fill(0));
    this.videoDurations.set(new Array(count).fill(0));

    // IntersectionObserver: tự phát khi vào viewport, dừng khi ra
    this.videoEls.forEach((ref, i) => {
      const el = ref.nativeElement;
      // Luôn muted lúc đầu để autoplay pass browser policy
      el.muted = true;

      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            // Sync volume state từ service TRƯỚC khi play
            el.volume = this.vol.volume();
            el.muted = this.vol.userHasInteracted() ? this.vol.muted() : true;
            // VideoPlayerService sẽ tự dừng video đang phát ở card khác
            this.videoPlayer
              .play(el)
              .then(() => this.playingIndex.set(i))
              .catch(() => {});
          } else {
            // Chỉ pause qua service (untrack active nếu cần)
            this.videoPlayer.pause(el);
            if (this.playingIndex() === i) this.playingIndex.set(null);
          }
        },
        { threshold: 0.5 },
      );
      obs.observe(el);
      this.observers.push(obs);
    });
  }

  ngOnDestroy(): void {
    this.observers.forEach((o) => o.disconnect());
    this.videoEls?.forEach((ref) => {
      const el = ref.nativeElement;
      el.pause();
      this.videoPlayer.unregister(el);
    });
  }

  // Close menu when clicking outside
  @HostListener('document:click')
  onDocumentClick(): void {
    this.showMenu.set(false);
    this.showShareMenu.set(false);
    this.showPrivacyDropdown.set(false);
  }

  togglePostMenu(event: Event): void {
    event.stopPropagation();
    this.showMenu.update((v) => !v);
  }

  onEdit(): void {
    this.showMenu.set(false);
    this.toastService.info('Tính năng chỉnh sửa đang phát triển');
  }

  onLike(): void {
    const prev = this.isLiked();
    const prevCount = this.likeCount();
    this.isLiked.set(!prev);
    this.likeCount.set(prev ? prevCount - 1 : prevCount + 1);

    this.postService.toggleLike(this.post().id).subscribe({
      error: () => {
        this.isLiked.set(prev);
        this.likeCount.set(prevCount);
      },
    });
  }

  onToggleComments(): void {
    this.showComments.update((v) => !v);
    if (this.showComments() && !this.commentsLoaded) {
      this.loadComments();
    }
  }

  loadComments(): void {
    this.isLoadingComments.set(true);
    this.postService.getComments(this.post().id, 1, this.PAGE_SIZE).subscribe({
      next: (res) => {
        this.comments.set(res.data.items);
        this.hasMoreComments.set(res.data.page < res.data.totalPages);
        this.commentPage.set(1);
        this.commentsLoaded = true;
      },
      error: () => this.toastService.error('Không thể tải bình luận'),
      complete: () => this.isLoadingComments.set(false),
    });
  }

  onLoadMoreComments(): void {
    const next = this.commentPage() + 1;
    this.isLoadingComments.set(true);
    this.postService
      .getComments(this.post().id, next, this.PAGE_SIZE)
      .subscribe({
        next: (res) => {
          this.comments.update((list) => [...list, ...res.data.items]);
          this.hasMoreComments.set(res.data.page < res.data.totalPages);
          this.commentPage.set(next);
        },
        error: () => this.toastService.error('Không thể tải thêm bình luận'),
        complete: () => this.isLoadingComments.set(false),
      });
  }

  onSubmitComment(): void {
    if (!this.commentText.trim()) return;
    this.isSubmittingComment.set(true);
    this.postService.addComment(this.post().id, this.commentText).subscribe({
      next: (res) => {
        this.comments.update((list) => [res.data, ...list]);
        this.commentText = '';
      },
      error: () => this.toastService.error('Không thể gửi bình luận'),
      complete: () => this.isSubmittingComment.set(false),
    });
  }

  onDeleteComment(commentId: string): void {
    this.postService.deleteComment(commentId).subscribe({
      next: () =>
        this.comments.update((list) => list.filter((c) => c.id !== commentId)),
      error: () => this.toastService.error('Không thể xóa bình luận'),
    });
  }

  onToggleVideo(event: Event, index: number): void {
    event.stopPropagation();
    const videos = this.videoEls.toArray();
    const target = videos[index]?.nativeElement;
    if (!target) return;

    if (this.playingIndex() === index) {
      // User bấm pause
      this.videoPlayer.pause(target);
      this.playingIndex.set(null);
    } else {
      // VideoPlayerService tự dừng mọi video khác (kể cả card khác)
      this.videoPlayer
        .play(target)
        .then(() => this.playingIndex.set(index))
        .catch(() => {});
    }
  }

  onTimeUpdate(index: number, event: Event): void {
    const el = event.target as HTMLVideoElement;
    this.videoTimes.update((arr) => {
      const copy = [...arr];
      copy[index] = el.currentTime;
      return copy;
    });
  }

  onLoadedMeta(index: number, event: Event): void {
    const el = event.target as HTMLVideoElement;
    this.videoDurations.update((arr) => {
      const copy = [...arr];
      copy[index] = el.duration;
      return copy;
    });
  }

  onVideoEnded(index: number): void {
    // loop đã bật nên không cần xử lý thêm
    if (this.playingIndex() === index) this.playingIndex.set(index);
  }

  onSeek(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const el = this.videoEls.toArray()[index]?.nativeElement;
    if (!el) return;
    el.currentTime = Number(input.value);
  }

  // Delegate tới VideoVolumeService – tự apply cho tất cả video trên trang
  onToggleMute(_index: number): void {
    this.vol.toggleMute();
  }

  onVolumeChange(_index: number, event: Event): void {
    const vol = Number((event.target as HTMLInputElement).value);
    this.vol.setVolume(vol);
  }

  onOpenMedia(index: number): void {
    this.lightboxIndex.set(index);
  }

  onCloseLightbox(): void {
    this.lightboxIndex.set(null);
  }

  onLightboxPrev(): void {
    const total = this.post().mediaFiles.length;
    const cur = this.lightboxIndex();
    if (cur === null) return;
    this.lightboxIndex.set((cur - 1 + total) % total);
  }

  onLightboxNext(): void {
    const total = this.post().mediaFiles.length;
    const cur = this.lightboxIndex();
    if (cur === null) return;
    this.lightboxIndex.set((cur + 1) % total);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (this.lightboxIndex() === null) return;
    if (e.key === 'Escape') this.onCloseLightbox();
    if (e.key === 'ArrowLeft') this.onLightboxPrev();
    if (e.key === 'ArrowRight') this.onLightboxNext();
  }

  onDelete(): void {
    this.postService.deletePost(this.post().id).subscribe({
      next: () => this.postDeleted.emit(this.post().id),
      error: () => this.toastService.error('Không thể xóa bài viết'),
    });
  }

  onShare(event?: Event): void {
    event?.stopPropagation();
    this.showShareMenu.update((v) => !v);
    this.showSharePanel.set(false);
  }

  onCopyLink(): void {
    this.showShareMenu.set(false);
    this.postService.getShareUrl(this.post().id).subscribe({
      next: (res) => {
        navigator.clipboard.writeText(res.data.shortUrl).then(() => {
          this.toastService.success('Đã copy link!');
        });
      },
      error: () => this.toastService.error('Không thể lấy link chia sẻ'),
    });
  }

  openSharePanel(): void {
    this.showShareMenu.set(false);
    this.shareCaption.set('');
    this.sharePrivacy.set(PostPrivacy.Public);
    this.showSharePanel.set(true);
  }

  closeSharePanel(): void {
    this.showSharePanel.set(false);
  }

  togglePrivacyDropdown(e: Event): void {
    e.stopPropagation();
    this.showPrivacyDropdown.update((v) => !v);
  }

  setPrivacy(value: PostPrivacy): void {
    this.sharePrivacy.set(value);
    this.showPrivacyDropdown.set(false);
  }

  confirmShareToFeed(): void {
    if (this.isSharing()) return;
    this.isSharing.set(true);
    this.postService
      .sharePostToFeed(
        this.post().originalPost?.id ?? this.post().id,
        this.shareCaption(),
        this.sharePrivacy(),
      )
      .subscribe({
        next: () => {
          this.shareCount.update((c) => c + 1);
          this.showSharePanel.set(false);
          this.toastService.success('Đã chia sẻ bài viết!');
        },
        error: (err) => {
          const msg =
            err?.error?.message ?? 'Không thể chia sẻ bài viết. Thử lại sau.';
          this.toastService.error(msg);
        },
        complete: () => this.isSharing.set(false),
      });
  }

  navigateToProfile(userId: string): void {
    this.router.navigate(['/profile', userId]);
  }
}
