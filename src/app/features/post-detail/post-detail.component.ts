import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { Subject, takeUntil } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';

import { PostService } from '../../core/services/post.service';
import { AuthService } from '../../core/services/auth.service';
import { Post } from '../../core/models/post.models';
import { PostCardComponent } from '../../shared/components/post-card/post-card.component';

@Component({
  selector: 'app-post-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, PostCardComponent],
  templateUrl: './post-detail.component.html',
  styleUrl: './post-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly postService = inject(PostService);
  private readonly authService = inject(AuthService);
  private readonly titleService = inject(Title);
  private readonly metaService = inject(Meta);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  readonly post = signal<Post | null>(null);
  readonly isLoading = signal(true);
  readonly errorCode = signal<number | null>(null); // 403 | 404 | 500

  readonly me = computed(() => this.authService.currentUser());

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        tap(() => {
          // Reset state khi navigate sang post khác
          this.post.set(null);
          this.isLoading.set(true);
          this.errorCode.set(null);
        }),
        switchMap((params) => {
          const id = params.get('id') ?? '';
          return this.postService.getPost(id);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (res) => {
          if (res.success && res.data) {
            this.post.set(res.data);
            this.updatePageMeta(res.data);
          } else {
            this.errorCode.set(404);
          }
          this.isLoading.set(false);
          this.cdr.markForCheck();
        },
        error: (err) => {
          const status = err?.status ?? 500;
          this.errorCode.set(status === 403 ? 403 : status === 404 ? 404 : 500);
          this.isLoading.set(false);
          this.cdr.markForCheck();
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    // Khôi phục title mặc định
    this.titleService.setTitle('SocialApp');
  }

  onPostDeleted(): void {
    this.router.navigate(['/feed']);
  }

  goBack(): void {
    // Nếu có history thì back, không thì về feed
    if (history.length > 1) {
      history.back();
    } else {
      this.router.navigate(['/feed']);
    }
  }

  private updatePageMeta(post: Post): void {
    const author = post.author.fullName;
    const snippet =
      post.content?.slice(0, 100) ?? 'Xem bài viết trên SocialApp';
    const title = `${author} – SocialApp`;
    const description =
      snippet.length < (post.content?.length ?? 0) ? snippet + '…' : snippet;
    const image = post.mediaFiles?.[0]?.mediaUrl ?? null;

    this.titleService.setTitle(title);
    this.metaService.updateTag({ name: 'description', content: description });

    // Open Graph
    this.metaService.updateTag({ property: 'og:title', content: title });
    this.metaService.updateTag({
      property: 'og:description',
      content: description,
    });
    this.metaService.updateTag({
      property: 'og:url',
      content: window.location.href,
    });
    if (image) {
      this.metaService.updateTag({ property: 'og:image', content: image });
    }
  }
}
