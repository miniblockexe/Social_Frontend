import {
  Component, OnInit, inject, signal, computed, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GroupService } from '../../../core/services/group.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { PostCardComponent } from '../../../shared/components/post-card/post-card.component';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { InfiniteScrollDirective } from '../../../shared/directives/infinite-scroll.directive';
import { SkeletonCardComponent } from '../../../shared/components/skeleton-card/skeleton-card.component';
import {
  GroupDetail, GroupMember, GroupJoinRequest,
  GroupPrivacy, GroupRole, GroupMembershipStatus,
  ReviewGroupPostDto, UpdateMemberRoleDto,
} from '../../../core/models/group.models';
import { Post } from '../../../core/models/post.models';

type GTab = 'feed' | 'members' | 'pending-posts' | 'pending-members';

@Component({
  selector: 'app-group-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, PostCardComponent, AvatarComponent,
    LoadingSpinnerComponent, InfiniteScrollDirective, SkeletonCardComponent],
  templateUrl: './group-detail.component.html',
  styleUrl: './group-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupDetailComponent implements OnInit {
  private readonly route    = inject(ActivatedRoute);
  private readonly router   = inject(Router);
  private readonly groupSvc = inject(GroupService);
  private readonly authSvc  = inject(AuthService);
  private readonly toast    = inject(ToastService);

  readonly GroupPrivacy = GroupPrivacy;
  readonly GroupRole    = GroupRole;
  readonly GroupMembershipStatus = GroupMembershipStatus;

  me = this.authSvc.currentUser;

  groupId   = signal('');
  group     = signal<GroupDetail | null>(null);
  isLoading = signal(true);
  activeTab = signal<GTab>('feed');

  // Feed
  posts       = signal<Post[]>([]);
  loadingFeed = signal(false);
  cursor      = signal<string | undefined>(undefined);
  hasMore     = signal(true);

  // Members
  members        = signal<GroupMember[]>([]);
  loadingMembers = signal(false);
  membersPage    = signal(1);
  hasMoreMembers = signal(true);

  // Pending posts
  pendingPosts        = signal<Post[]>([]);
  loadingPendingPosts = signal(false);

  // Pending join requests
  pendingReqs        = signal<GroupJoinRequest[]>([]);
  loadingPendingReqs = signal(false);

  // Create post
  showCreate   = signal(false);
  postContent  = signal('');
  postFiles    = signal<File[]>([]);
  postPreviews = signal<{ url: string; type: 'image' | 'video' }[]>([]);
  submitting   = signal(false);

  // ── Settings modal ──────────────────────────────────────────────────
  showSettings       = signal(false);
  editName           = signal('');
  editDesc           = signal('');
  editPrivacy        = signal<GroupPrivacy>(GroupPrivacy.Public);
  editRequireApproval    = signal(false);
  editRequirePostApproval = signal(false);
  editAvatarFile     = signal<File | null>(null);
  editAvatarPreview  = signal<string | null>(null);
  editCoverFile      = signal<File | null>(null);
  editCoverPreview   = signal<string | null>(null);
  isSavingSettings   = signal(false);

  // ── Delete modal ────────────────────────────────────────────────────
  showDeleteConfirm  = signal(false);
  deleteConfirmText  = signal('');
  isDeletingGroup    = signal(false);

  // Computed
  isAdmin  = computed(() => (this.group()?.viewerRole ?? -1) >= GroupRole.Admin);
  isOwner  = computed(() => this.group()?.viewerRole === GroupRole.Owner);
  isMember = computed(() => this.group()?.membershipStatus === GroupMembershipStatus.Member);
  isPending= computed(() => this.group()?.membershipStatus === GroupMembershipStatus.PendingApproval);
  canPost  = computed(() => {
    const g = this.group();
    if (!g) return false;
    return g.privacy === GroupPrivacy.Public || this.isMember();
  });
  canDeleteConfirm = computed(() =>
    this.deleteConfirmText().trim().toLowerCase() === this.group()?.name?.toLowerCase()
  );

  ngOnInit() {
    this.route.paramMap.subscribe(p => {
      this.groupId.set(p.get('id') ?? '');
      this.loadGroup();
    });
  }

  loadGroup() {
    this.isLoading.set(true);
    this.groupSvc.getGroup(this.groupId()).subscribe({
      next: res => {
        this.group.set(res.data);
        this.isLoading.set(false);
        this.loadFeed();
        if (this.isAdmin()) this.loadPendingReqs();
      },
      error: () => { this.toast.error('Không thể tải nhóm.'); this.isLoading.set(false); this.router.navigate(['/groups']); },
    });
  }

  // ── Feed ─────────────────────────────────────────────────────────────

  loadFeed() {
    if (this.loadingFeed() || !this.hasMore()) return;
    this.loadingFeed.set(true);
    this.groupSvc.getGroupFeed(this.groupId(), 1, 10, this.cursor()).subscribe({
      next: res => {
        const items = res.data?.items ?? [];
        this.posts.update(p => [...p, ...items]);
        this.hasMore.set(items.length === 10);
        if (items.length) this.cursor.set(items[items.length - 1].id);
        this.loadingFeed.set(false);
      },
      error: () => { this.toast.error('Không thể tải bài đăng.'); this.loadingFeed.set(false); },
    });
  }

  // ── Members ───────────────────────────────────────────────────────────

  loadMembers() {
    if (this.loadingMembers() || !this.hasMoreMembers()) return;
    this.loadingMembers.set(true);
    this.groupSvc.getMembers(this.groupId(), this.membersPage(), 20).subscribe({
      next: res => {
        const items = res.data?.items ?? [];
        this.members.update(m => [...m, ...items]);
        this.hasMoreMembers.set(items.length === 20);
        this.membersPage.update(p => p + 1);
        this.loadingMembers.set(false);
      },
      error: () => this.loadingMembers.set(false),
    });
  }

  loadPendingPosts() {
    this.loadingPendingPosts.set(true);
    this.groupSvc.getPendingPosts(this.groupId()).subscribe({
      next: res => { this.pendingPosts.set(res.data?.items ?? []); this.loadingPendingPosts.set(false); },
      error: () => this.loadingPendingPosts.set(false),
    });
  }

  loadPendingReqs() {
    this.loadingPendingReqs.set(true);
    this.groupSvc.getPendingJoinRequests(this.groupId()).subscribe({
      next: res => { this.pendingReqs.set(res.data?.items ?? []); this.loadingPendingReqs.set(false); },
      error: () => this.loadingPendingReqs.set(false),
    });
  }

  setTab(tab: GTab) {
    this.activeTab.set(tab);
    if (tab === 'members' && !this.members().length) this.loadMembers();
    if (tab === 'pending-posts' && !this.pendingPosts().length) this.loadPendingPosts();
    if (tab === 'pending-members' && !this.pendingReqs().length) this.loadPendingReqs();
  }

  // ── Create Post ───────────────────────────────────────────────────────

  onFileChange(e: Event) {
    const files = Array.from((e.target as HTMLInputElement).files ?? []);
    this.postFiles.set(files);
    this.postPreviews.set(files.map(f => ({
      url: URL.createObjectURL(f),
      type: f.type.startsWith('video') ? 'video' : 'image',
    })));
  }

  submitPost() {
    const content = this.postContent().trim();
    if (!content && !this.postFiles().length) { this.toast.error('Bài đăng phải có nội dung hoặc file.'); return; }
    this.submitting.set(true);
    this.groupSvc.createGroupPost(this.groupId(), content, this.postFiles().length ? this.postFiles() : undefined).subscribe({
      next: res => {
        if (res.data) {
          const g = this.group();
          if (g?.requirePostApproval && !this.isAdmin()) this.toast.info('Bài đăng đang chờ admin duyệt.');
          else { this.posts.update(l => [res.data, ...l]); this.toast.success('Đăng bài thành công!'); }
        }
        this.postContent.set(''); this.postFiles.set([]); this.postPreviews.set([]);
        this.showCreate.set(false); this.submitting.set(false);
      },
      error: err => { this.toast.error(err?.error?.message || 'Không thể đăng bài.'); this.submitting.set(false); },
    });
  }

  // ── Review ────────────────────────────────────────────────────────────

  reviewPost(postId: string, approve: boolean) {
    this.groupSvc.reviewGroupPost(this.groupId(), postId, { approve }).subscribe({
      next: () => {
        this.toast.success(approve ? 'Đã duyệt bài.' : 'Đã từ chối bài.');
        this.pendingPosts.update(l => l.filter(p => p.id !== postId));
        if (approve) { this.posts.set([]); this.cursor.set(undefined); this.hasMore.set(true); this.loadFeed(); }
      },
      error: () => this.toast.error('Không thể xử lý bài đăng.'),
    });
  }

  reviewRequest(requestId: string, approve: boolean) {
    this.groupSvc.reviewJoinRequest(this.groupId(), requestId, { approve }).subscribe({
      next: () => {
        this.toast.success(approve ? 'Đã chấp nhận thành viên.' : 'Đã từ chối đơn.');
        this.pendingReqs.update(l => l.filter(r => r.id !== requestId));
        if (approve) this.group.update(g => g ? { ...g, memberCount: g.memberCount + 1 } : g);
      },
      error: () => this.toast.error('Không thể xử lý đơn.'),
    });
  }

  // ── Member management ─────────────────────────────────────────────────

  kickMember(userId: string, name: string) {
    if (!confirm(`Kick ${name} khỏi nhóm?`)) return;
    this.groupSvc.kickMember(this.groupId(), userId).subscribe({
      next: () => { this.toast.success(`Đã kick ${name}.`); this.members.update(l => l.filter(m => m.user.id !== userId)); },
      error: () => this.toast.error('Không thể kick thành viên.'),
    });
  }

  updateRole(userId: string, role: GroupRole) {
    this.groupSvc.updateMemberRole(this.groupId(), userId, { role }).subscribe({
      next: () => { this.toast.success('Đã cập nhật vai trò.'); this.members.update(l => l.map(m => m.user.id === userId ? { ...m, role } : m)); },
      error: () => this.toast.error('Không thể cập nhật vai trò.'),
    });
  }

  // ── Join / Leave ──────────────────────────────────────────────────────

  onJoin() {
    const g = this.group(); if (!g) return;
    this.groupSvc.joinGroup(g.id).subscribe({
      next: () => {
        this.toast.success(g.requireApproval ? 'Đã gửi đơn tham gia!' : 'Đã tham gia nhóm!');
        this.group.update(gp => gp ? {
          ...gp,
          membershipStatus: g.requireApproval ? GroupMembershipStatus.PendingApproval : GroupMembershipStatus.Member,
          memberCount: g.requireApproval ? gp.memberCount : gp.memberCount + 1,
        } : gp);
        if (!g.requireApproval) this.loadFeed();
      },
      error: err => this.toast.error(err?.error?.message || 'Không thể tham gia nhóm.'),
    });
  }

  onLeave() {
    if (!confirm('Bạn có chắc muốn rời nhóm này?')) return;
    this.groupSvc.leaveGroup(this.groupId()).subscribe({
      next: () => {
        this.toast.success('Đã rời nhóm.');
        this.group.update(g => g ? { ...g, membershipStatus: GroupMembershipStatus.None, viewerRole: null, memberCount: Math.max(0, g.memberCount - 1) } : g);
        this.posts.set([]);
      },
      error: err => this.toast.error(err?.error?.message || 'Không thể rời nhóm.'),
    });
  }

  onCancelRequest() {
    this.groupSvc.cancelJoinRequest(this.groupId()).subscribe({
      next: () => { this.toast.info('Đã hủy đơn tham gia.'); this.group.update(g => g ? { ...g, membershipStatus: GroupMembershipStatus.None } : g); },
      error: () => this.toast.error('Không thể hủy đơn.'),
    });
  }

  // ── Settings ──────────────────────────────────────────────────────────

  openSettings() {
    const g = this.group(); if (!g) return;
    this.editName.set(g.name);
    this.editDesc.set(g.description ?? '');
    this.editPrivacy.set(g.privacy);
    this.editRequireApproval.set(g.requireApproval);
    this.editRequirePostApproval.set(g.requirePostApproval);
    this.editAvatarFile.set(null);
    this.editAvatarPreview.set(null);
    this.editCoverFile.set(null);
    this.editCoverPreview.set(null);
    this.showSettings.set(true);
  }

  closeSettings() {
    this.showSettings.set(false);
  }

  onEditAvatarChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { this.toast.error('Ảnh tối đa 10MB.'); return; }
    this.editAvatarFile.set(file);
    const reader = new FileReader();
    reader.onload = ev => this.editAvatarPreview.set(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  onEditCoverChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { this.toast.error('Ảnh tối đa 10MB.'); return; }
    this.editCoverFile.set(file);
    const reader = new FileReader();
    reader.onload = ev => this.editCoverPreview.set(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  saveSettings() {
    if (!this.editName().trim()) { this.toast.error('Tên nhóm không được để trống.'); return; }
    this.isSavingSettings.set(true);
    this.groupSvc.updateGroup(this.groupId(), {
      name: this.editName().trim(),
      description: this.editDesc().trim(),
      privacy: this.editPrivacy(),
      requireApproval: this.editRequireApproval(),
      requirePostApproval: this.editRequirePostApproval(),
      avatar: this.editAvatarFile() ?? undefined,
      cover: this.editCoverFile() ?? undefined,
    }).subscribe({
      next: res => {
        this.group.set(res.data);
        this.toast.success('Đã cập nhật thông tin nhóm!');
        this.isSavingSettings.set(false);
        this.closeSettings();
      },
      error: err => { this.toast.error(err?.error?.message || 'Không thể cập nhật nhóm.'); this.isSavingSettings.set(false); },
    });
  }

  // ── Delete Group ──────────────────────────────────────────────────────

  openDeleteConfirm() {
    this.deleteConfirmText.set('');
    this.showDeleteConfirm.set(true);
  }

  closeDeleteConfirm() {
    this.showDeleteConfirm.set(false);
    this.deleteConfirmText.set('');
  }

  confirmDelete() {
    if (!this.canDeleteConfirm()) return;
    this.isDeletingGroup.set(true);
    this.groupSvc.deleteGroup(this.groupId()).subscribe({
      next: () => {
        this.toast.success('Đã xóa nhóm.');
        this.router.navigate(['/groups']);
      },
      error: err => { this.toast.error(err?.error?.message || 'Không thể xóa nhóm.'); this.isDeletingGroup.set(false); },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  onPostDeleted(id: string) { this.posts.update(l => l.filter(p => p.id !== id)); }
  onPostUpdated(post: Post) { this.posts.update(l => l.map(p => p.id === post.id ? post : p)); }
  roleLabel(r: GroupRole)   { return r === GroupRole.Owner ? 'Owner' : r === GroupRole.Admin ? 'Admin' : 'Thành viên'; }
  roleCls(r: GroupRole)     { return r === GroupRole.Owner ? 'owner' : r === GroupRole.Admin ? 'admin' : 'member'; }
}