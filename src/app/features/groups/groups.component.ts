import {
  Component, OnInit, inject, signal, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GroupService } from '../../core/services/group.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { InfiniteScrollDirective } from '../../shared/directives/infinite-scroll.directive';
import { SkeletonCardComponent } from '../../shared/components/skeleton-card/skeleton-card.component';
import {
  GroupSummary, GroupPrivacy, GroupMembershipStatus, CreateGroupRequest,
} from '../../core/models/group.models';

@Component({
  selector: 'app-groups',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, AvatarComponent, LoadingSpinnerComponent, InfiniteScrollDirective, SkeletonCardComponent],
  templateUrl: './groups.component.html',
  styleUrl: './groups.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupsComponent implements OnInit {
  private readonly groupService = inject(GroupService);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);

  readonly GroupPrivacy = GroupPrivacy;
  readonly GroupMembershipStatus = GroupMembershipStatus;

  activeTab = signal<'discover' | 'mine'>('discover');
  keyword = signal('');
  private searchTimer?: ReturnType<typeof setTimeout>;

  discoverGroups = signal<GroupSummary[]>([]);
  isLoadingDiscover = signal(false);
  discoverPage = signal(1);
  hasMoreDiscover = signal(true);

  myGroups = signal<GroupSummary[]>([]);
  isLoadingMine = signal(false);
  minePage = signal(1);
  hasMoreMine = signal(true);

  showCreateModal = signal(false);
  isCreating = signal(false);
  createForm = signal<CreateGroupRequest>({
    name: '', description: '', privacy: GroupPrivacy.Public,
    requireApproval: false, requirePostApproval: false,
  });
  avatarPreview = signal<string | null>(null);
  avatarFile = signal<File | null>(null);

  me = this.authService.currentUser;

  ngOnInit() {
    this.loadDiscover();
    this.loadMyGroups();
  }

  setTab(tab: 'discover' | 'mine') { this.activeTab.set(tab); }

  onKeywordChange(value: string) {
    this.keyword.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.discoverGroups.set([]); this.discoverPage.set(1); this.hasMoreDiscover.set(true);
      this.loadDiscover();
    }, 400);
  }

  loadDiscover() {
    if (this.isLoadingDiscover() || !this.hasMoreDiscover()) return;
    this.isLoadingDiscover.set(true);
    this.groupService.searchGroups(this.keyword() || undefined, this.discoverPage(), 20).subscribe({
      next: res => {
        if (res.data) {
          this.discoverGroups.update(p => [...p, ...res.data.items]);
          this.hasMoreDiscover.set(res.data.items.length === 20 && this.discoverGroups().length < res.data.totalCount);
          this.discoverPage.update(p => p + 1);
        }
        this.isLoadingDiscover.set(false);
      },
      error: () => { this.toastService.error('Không thể tải danh sách nhóm.'); this.isLoadingDiscover.set(false); },
    });
  }

  loadMyGroups() {
    if (this.isLoadingMine() || !this.hasMoreMine()) return;
    this.isLoadingMine.set(true);
    this.groupService.getMyGroups(this.minePage(), 20).subscribe({
      next: res => {
        if (res.data) {
          this.myGroups.update(p => [...p, ...res.data.items]);
          this.hasMoreMine.set(res.data.items.length === 20 && this.myGroups().length < res.data.totalCount);
          this.minePage.update(p => p + 1);
        }
        this.isLoadingMine.set(false);
      },
      error: () => { this.toastService.error('Không thể tải nhóm của bạn.'); this.isLoadingMine.set(false); },
    });
  }

  onJoin(group: GroupSummary) {
    this.groupService.joinGroup(group.id).subscribe({
      next: () => {
        this.toastService.success(group.requireApproval ? 'Đã gửi đơn tham gia nhóm!' : 'Đã tham gia nhóm!');
        this.discoverGroups.update(list => list.map(g => g.id === group.id
          ? { ...g, membershipStatus: group.requireApproval ? GroupMembershipStatus.PendingApproval : GroupMembershipStatus.Member }
          : g));
      },
      error: err => this.toastService.error(err?.error?.message || 'Không thể tham gia nhóm.'),
    });
  }

  onCancelRequest(group: GroupSummary) {
    this.groupService.cancelJoinRequest(group.id).subscribe({
      next: () => {
        this.toastService.info('Đã hủy đơn tham gia.');
        this.discoverGroups.update(list => list.map(g => g.id === group.id
          ? { ...g, membershipStatus: GroupMembershipStatus.None } : g));
      },
      error: () => this.toastService.error('Không thể hủy đơn.'),
    });
  }

  openCreateModal() { this.showCreateModal.set(true); }

  closeCreateModal() {
    this.showCreateModal.set(false);
    this.avatarPreview.set(null); this.avatarFile.set(null);
    this.createForm.set({ name: '', description: '', privacy: GroupPrivacy.Public, requireApproval: false, requirePostApproval: false });
  }

  onAvatarChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { this.toastService.error('Ảnh đại diện tối đa 10MB.'); return; }
    this.avatarFile.set(file);
    const reader = new FileReader();
    reader.onload = e => this.avatarPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  updateForm(patch: Partial<CreateGroupRequest>) { this.createForm.update(f => ({ ...f, ...patch })); }

  submitCreate() {
    const form = this.createForm();
    if (!form.name.trim()) { this.toastService.error('Tên nhóm không được để trống.'); return; }
    this.isCreating.set(true);
    this.groupService.createGroup({ ...form, avatar: this.avatarFile() ?? undefined }).subscribe({
      next: () => {
        this.toastService.success('Tạo nhóm thành công!');
        this.isCreating.set(false);
        this.closeCreateModal();
        this.myGroups.set([]); this.minePage.set(1); this.hasMoreMine.set(true);
        this.loadMyGroups();
        this.setTab('mine');
      },
      error: err => { this.toastService.error(err?.error?.message || 'Không thể tạo nhóm.'); this.isCreating.set(false); },
    });
  }

  privacyLabel(p: GroupPrivacy) { return p === GroupPrivacy.Public ? 'Công khai' : 'Riêng tư'; }
  privacyIcon(p: GroupPrivacy) { return p === GroupPrivacy.Public ? 'fa-earth-asia' : 'fa-lock'; }
  trackById(_: number, g: GroupSummary) { return g.id; }
}
