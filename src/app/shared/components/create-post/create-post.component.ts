import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import gsap from 'gsap';
import { PostService } from '../../../core/services/post.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Post, PostPrivacy } from '../../../core/models/post.models';
import { AvatarComponent } from '../avatar/avatar.component';
import { LoadingSpinnerComponent } from '../loading-spinner/loading-spinner.component';

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB
const CIRCUMFERENCE = 2 * Math.PI * 15.9; // SVG ring circumference

export interface PreviewFile {
  url: string;
  type: 'image' | 'video';
  file: File;
}

@Component({
  selector: 'app-create-post',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AvatarComponent,
    LoadingSpinnerComponent,
  ],
  templateUrl: './create-post.component.html',
  styleUrl: './create-post.component.scss',
})
export class CreatePostComponent implements AfterViewInit, OnDestroy {
  private readonly postService = inject(PostService);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('textareaEl') textareaRef!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('collapsedEl') collapsedRef!: ElementRef<HTMLElement>;
  @ViewChild('formEl') formRef!: ElementRef<HTMLElement>;

  readonly PostPrivacy = PostPrivacy;

  postCreated = output<Post>();

  isOpen = signal(false);
  content = '';
  privacy = signal<PostPrivacy>(PostPrivacy.Public);
  previewFiles = signal<PreviewFile[]>([]);
  isSubmitting = signal(false);
  showPrivacyMenu = signal(false);

  currentUser = this.authService.currentUser;

  private ctx: gsap.Context | null = null;
  private readonly prefersReduced = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;

  canSubmit = computed(
    () =>
      (this.content.trim().length > 0 || this.previewFiles().length > 0) &&
      !this.isSubmitting(),
  );

  privacyIcon = computed(() => {
    switch (this.privacy()) {
      case PostPrivacy.Public:
        return 'fa-solid fa-earth-asia';
      case PostPrivacy.Friends:
        return 'fa-solid fa-user-group';
      case PostPrivacy.OnlyMe:
        return 'fa-solid fa-lock';
    }
  });

  privacyLabel = computed(() => {
    switch (this.privacy()) {
      case PostPrivacy.Public:
        return 'Công khai';
      case PostPrivacy.Friends:
        return 'Bạn bè';
      case PostPrivacy.OnlyMe:
        return 'Chỉ mình tôi';
    }
  });

  /** SVG stroke-dasharray cho char ring */
  charDashArray = computed(() => {
    const ratio = Math.min(this.content.length / 5000, 1);
    const filled = CIRCUMFERENCE * ratio;
    return `${filled} ${CIRCUMFERENCE}`;
  });

  ngAfterViewInit(): void {
    // Collapsed state entrance
    if (!this.prefersReduced && this.collapsedRef?.nativeElement) {
      this.ctx = gsap.context(() => {
        gsap.from(this.collapsedRef.nativeElement, {
          y: -12,
          opacity: 0,
          duration: 0.4,
          ease: 'power3.out',
          clearProps: 'all',
        });
      });
    }
  }

  ngOnDestroy(): void {
    this.ctx?.revert();
    this.previewFiles().forEach((p) => URL.revokeObjectURL(p.url));
  }

  open(): void {
    this.isOpen.set(true);
    this.animateFormIn();
  }

  openWithMedia(): void {
    this.isOpen.set(true);
    this.animateFormIn(() => setTimeout(() => this.triggerFileInput(), 50));
  }

  openWithMood(): void {
    this.isOpen.set(true);
    this.animateFormIn(() => setTimeout(() => this.toggleEmoji(), 50));
  }

  openWithLive(): void {
    this.toastService.info('Tính năng livestream đang phát triển');
  }

  close(): void {
    if (!this.prefersReduced && this.formRef?.nativeElement) {
      gsap.to(this.formRef.nativeElement, {
        opacity: 0,
        y: -8,
        duration: 0.22,
        ease: 'power3.in',
        onComplete: () => {
          this.isOpen.set(false);
          this.resetForm();
        },
      });
    } else {
      this.isOpen.set(false);
      this.resetForm();
    }
  }

  private animateFormIn(cb?: () => void): void {
    if (this.prefersReduced) {
      cb?.();
      return;
    }
    // AfterViewInit fires after next tick once formEl is in DOM
    requestAnimationFrame(() => {
      if (this.formRef?.nativeElement) {
        gsap.from(this.formRef.nativeElement, {
          opacity: 0,
          y: 14,
          duration: 0.35,
          ease: 'power3.out',
          clearProps: 'all',
          onComplete: () => {
            // Focus textarea
            this.textareaRef?.nativeElement?.focus();
            cb?.();
          },
        });

        // Stagger toolbar buttons
        gsap.from('.cp-tool-btn', {
          opacity: 0,
          scale: 0.8,
          duration: 0.28,
          stagger: 0.04,
          ease: 'back.out(1.6)',
          delay: 0.18,
          clearProps: 'all',
        });
      } else {
        this.textareaRef?.nativeElement?.focus();
        cb?.();
      }
    });
  }

  togglePrivacyMenu(event: Event): void {
    event.stopPropagation();
    this.showPrivacyMenu.update((v) => !v);
  }

  setPrivacy(value: number): void {
    this.privacy.set(value as PostPrivacy);
    this.showPrivacyMenu.set(false);
  }

  onContentInput(): void {
    // Auto-resize textarea
    const el = this.textareaRef?.nativeElement;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 260) + 'px';
    }
  }

  triggerFileInput(): void {
    this.fileInputRef?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    const valid = files.filter((f) => {
      const isMedia =
        f.type.startsWith('image/') || f.type.startsWith('video/');
      const underLimit = f.size <= MAX_FILE_SIZE;
      if (!isMedia)
        this.toastService.warning(`${f.name}: chỉ chấp nhận ảnh hoặc video`);
      if (!underLimit)
        this.toastService.warning(`${f.name}: vượt quá giới hạn 200 MB`);
      return isMedia && underLimit;
    });

    const newPreviews: PreviewFile[] = valid.map((f) => ({
      url: URL.createObjectURL(f),
      type: f.type.startsWith('video/') ? 'video' : 'image',
      file: f,
    }));

    this.previewFiles.update((list) => [...list, ...newPreviews]);
    input.value = '';

    // Animate newly added items
    if (!this.prefersReduced) {
      requestAnimationFrame(() => {
        const items = document.querySelectorAll(
          '.cp-media-item:not([data-anim])',
        );
        items.forEach((el) => {
          el.setAttribute('data-anim', '1');
          gsap.from(el, {
            scale: 0.88,
            opacity: 0,
            duration: 0.3,
            ease: 'back.out(1.4)',
            clearProps: 'all',
          });
        });
      });
    }
  }

  removeFile(index: number): void {
    const el = document.querySelectorAll('.cp-media-item')[index];
    const remove = () => {
      URL.revokeObjectURL(this.previewFiles()[index].url);
      this.previewFiles.update((list) => list.filter((_, i) => i !== index));
    };

    if (!this.prefersReduced && el) {
      gsap.to(el, {
        scale: 0.8,
        opacity: 0,
        duration: 0.2,
        ease: 'power2.in',
        onComplete: remove,
      });
    } else {
      remove();
    }
  }

  toggleEmoji(): void {
    this.toastService.info('Tính năng emoji đang phát triển');
  }

  toggleLocation(): void {
    this.toastService.info('Tính năng vị trí đang phát triển');
  }

  toggleTagFriends(): void {
    this.toastService.info('Tính năng gắn thẻ bạn bè đang phát triển');
  }

  onSubmit(): void {
    if (!this.canSubmit()) return;
    this.isSubmitting.set(true);

    const files = this.previewFiles().map((p) => p.file);

    this.postService.createPost(this.content, this.privacy(), files).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.postCreated.emit(res.data);
        this.toastService.success('Đăng bài thành công!');
        this.close();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.toastService.error(err?.error?.message ?? 'Đăng bài thất bại');
      },
    });
  }

  resetForm(): void {
    this.content = '';
    this.privacy.set(PostPrivacy.Public);
    this.previewFiles().forEach((p) => URL.revokeObjectURL(p.url));
    this.previewFiles.set([]);
    this.showPrivacyMenu.set(false);
  }
}
