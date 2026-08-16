import {
  Component,
  OnInit,
  inject,
  signal,
  input,
  output,
  computed,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { MessageService } from '../../../core/services/message.service';
import { AuthService } from '../../../core/services/auth.service';
import { Conversation } from '../../../core/models/message.models';
import { UserBrief } from '../../../core/models/auth.models';
import { AvatarComponent } from '../avatar/avatar.component';

@Component({
  selector: 'app-share-to-friend-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AvatarComponent],
  templateUrl: './share-to-friend-modal.component.html',
  styleUrl: './share-to-friend-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareToFriendModalComponent implements OnInit {
  private readonly messageService = inject(MessageService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  currentUserId = computed(() => this.authService.currentUser()?.id ?? '');

  /** Id bài viết cần chia sẻ — bắt buộc */
  readonly postId = input.required<string>();

  /** Phát ra khi đóng modal (bất kể thành công hay hủy) */
  readonly closed = output<void>();

  readonly conversations = signal<Conversation[]>([]);
  readonly isLoading = signal(true);
  readonly isSending = signal(false);
  readonly sentIds = signal<Set<string>>(new Set());
  readonly errorMsg = signal<string | null>(null);

  caption = '';

  getOtherUser(conv: Conversation): UserBrief | undefined {
    return conv.participants.find((p) => p.id !== this.currentUserId());
  }

  getConvName(conv: Conversation): string {
    if (conv.isGroup) return conv.groupName ?? 'Nhóm';
    return this.getOtherUser(conv)?.fullName ?? 'Người dùng';
  }

  getConvAvatar(conv: Conversation): string | null {
    if (conv.isGroup) return conv.groupAvatarUrl ?? null;
    return this.getOtherUser(conv)?.avatarUrl ?? null;
  }

  ngOnInit(): void {
    this.messageService.getConversations().subscribe({
      next: (res) => {
        if (res.success && res.data?.items) {
          this.conversations.set(res.data.items);
        }
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMsg.set('Không tải được danh sách hội thoại.');
        this.cdr.markForCheck();
      },
    });
  }

  onOverlayClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('stf-overlay')) {
      this.closed.emit();
    }
  }

  trackByConv(_: number, c: Conversation): string {
    return c.id;
  }

  isSent(convId: string): boolean {
    return this.sentIds().has(convId);
  }

  onSend(conv: Conversation): void {
    if (this.isSending() || this.isSent(conv.id)) return;

    this.isSending.set(true);
    this.errorMsg.set(null);

    this.messageService
      .sharePostToConversation(
        this.postId(),
        conv.id,
        this.caption.trim() || undefined,
      )
      .subscribe({
        next: () => {
          const next = new Set(this.sentIds());
          next.add(conv.id);
          this.sentIds.set(next);
          this.isSending.set(false);
          this.cdr.markForCheck();
        },
        error: () => {
          this.isSending.set(false);
          this.errorMsg.set('Gửi thất bại. Vui lòng thử lại.');
          this.cdr.markForCheck();
        },
      });
  }

  onGoToChat(conv: Conversation): void {
    this.closed.emit();
    this.router.navigate(['/messages', conv.id]);
  }
}
