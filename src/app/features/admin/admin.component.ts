import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  inject,
  signal,
  computed,
  DestroyRef,
  ElementRef,
  NgZone,
  Renderer2,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { TruncatePipe } from '../../shared/pipes/truncate.pipe';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminService } from '../../core/services/admin.service';
import { ToastService } from '../../core/services/toast.service';
import {
  AdminDashboard,
  AdminPost,
  AdminUser,
} from '../../core/models/admin.models';
import { UserRole } from '../../core/models/auth.models';
import { gsap } from 'gsap';

type AdminTab = 'users' | 'posts' | 'reports' | 'stats';

interface StatCard {
  key: string;
  label: string;
  value: number;
  icon: string;
  color: string;
  trend?: number;
}

interface Report {
  id: string;
  type: string;
  reason: string;
  createdAt: string;
}

const PAGE_SIZE = 20;

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    AvatarComponent,
    TruncatePipe,
  ],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss',
})
export class AdminComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly adminService = inject(AdminService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly el = inject(ElementRef);
  private readonly ngZone = inject(NgZone);
  private readonly renderer = inject(Renderer2);

  readonly Math = Math;
  readonly UserRole = UserRole;

  // GSAP tween registry — killed in ngOnDestroy
  private tweens: gsap.core.Tween[] = [];
  private reducedMotion = false;

  activeTab = signal<AdminTab>('users');

  // đổi sang signal để template signal-call hoạt động
  searchQuery = signal('');
  userFilter = signal('all');

  private _dashboard = signal<AdminDashboard | null>(null);

  stats = computed<StatCard[]>(() => {
    const d = this._dashboard();
    if (!d) return [];
    return [
      {
        key: 'users',
        label: 'Người dùng',
        value: d.totalUsers ?? 0,
        icon: 'fa-solid fa-users',
        color: 'blue',
        trend: 12,
      },
      {
        key: 'posts',
        label: 'Bài viết',
        value: d.totalPosts ?? 0,
        icon: 'fa-solid fa-newspaper',
        color: 'teal',
        trend: 8,
      },
      {
        key: 'reports',
        label: 'Báo cáo',
        value: 0,
        icon: 'fa-solid fa-flag',
        color: 'red',
        trend: -3,
      },
      {
        key: 'online',
        label: 'Đang online',
        value: 0,
        icon: 'fa-solid fa-circle-dot',
        color: 'purple',
        trend: undefined,
      },
    ];
  });

  pendingReportsCount = computed(
    () => this.reports().filter((r) => (r as any).status === 'pending').length,
  );

  private _users = signal<AdminUser[]>([]);
  isLoadingUsers = signal(false);
  private _usersPage = signal(1);
  private _usersTotal = signal(0);

  // dùng searchQuery() và userFilter() thay vì plain-string access
  filteredUsers = computed(() => {
    let list = this._users();
    const q = this.searchQuery().toLowerCase();
    if (q) {
      list = list.filter(
        (u) =>
          u.fullName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      );
    }
    if (this.userFilter() === 'active') list = list.filter((u) => !u.isBanned);
    if (this.userFilter() === 'banned') list = list.filter((u) => u.isBanned);
    if (this.userFilter() === 'admin')
      list = list.filter(
        (u) => u.role === 'admin' || u.role === UserRole.Admin,
      );
    return list;
  });

  totalUsers = computed(() => this._usersTotal());
  currentPage = computed(() => this._usersPage());
  totalPages = computed(() => Math.ceil(this._usersTotal() / PAGE_SIZE) || 1);

  adminPosts = signal<AdminPost[]>([]);
  isLoadingPosts = signal(false);

  reports = signal<Report[]>([]);

  ngOnInit(): void {
    this.reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    this.loadDashboard();
    this.loadUsers();
  }

  ngAfterViewInit(): void {
    if (this.reducedMotion) return;
    // Chạy GSAP ngoài Angular zone không trigger change detection 60fps
    this.ngZone.runOutsideAngular(() => this.setupPageEntrance());
  }

  ngOnDestroy(): void {
    this.tweens.forEach((t) => t.kill());
    this.tweens.length = 0;
  }

  setTab(tab: AdminTab): void {
    this.activeTab.set(tab);
    this.searchQuery.set(''); // dùng .set() chứ không gán trực tiếp
    // Animate panel mới sau khi Angular render xong
    setTimeout(() => {
      if (!this.reducedMotion) {
        this.ngZone.runOutsideAngular(() => this.animateTabPanel());
      }
    }, 0);
    switch (tab) {
      case 'users':
        this.loadUsers();
        break;
      case 'posts':
        this.loadPosts();
        break;
      case 'reports':
        this.loadReports();
        break;
      case 'stats':
        break; // không có dữ liệu load
    }
  }

  prevPage(): void {
    if (this._usersPage() <= 1) return;
    this._usersPage.update((p) => p - 1);
    this.loadUsers();
  }

  nextPage(): void {
    if (this._usersPage() >= this.totalPages()) return;
    this._usersPage.update((p) => p + 1);
    this.loadUsers();
  }

  private loadDashboard(): void {
    this.adminService
      .getDashboard()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (res.success) {
            this._dashboard.set(res.data);
            // Cho Angular render stat cards trước, sau đó mới animate
            setTimeout(() => {
              if (!this.reducedMotion) {
                this.ngZone.runOutsideAngular(() => this.animateStatCards());
              }
            }, 60);
          }
        },
      });
  }

  private loadUsers(): void {
    this.isLoadingUsers.set(true);
    this.adminService
      .getUsers({ page: this._usersPage(), size: PAGE_SIZE })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (res.success) {
            this._users.set(res.data.items.map((u) => ({ ...u })));
            this._usersTotal.set(res.data.totalCount);
            setTimeout(() => {
              if (!this.reducedMotion) {
                this.ngZone.runOutsideAngular(() => this.animateTableRows());
              }
            }, 60);
          }
        },
        complete: () => this.isLoadingUsers.set(false),
      });
  }

  private loadPosts(): void {
    this.isLoadingPosts.set(true);
    this.adminService
      .getPosts({ page: 1, size: PAGE_SIZE })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.adminPosts.set(res.data.items);
            setTimeout(() => {
              if (!this.reducedMotion) {
                this.ngZone.runOutsideAngular(() => this.animateTableRows());
              }
            }, 60);
          }
        },
        complete: () => this.isLoadingPosts.set(false),
      });
  }

  private loadReports(): void {
    // BE chưa có Reports endpoint — để trống, animate empty state
    this.reports.set([]);
  }

  onToggleBan(user: AdminUser): void {
    const action$ = user.isBanned
      ? this.adminService.unbanUser(user.id)
      : this.adminService.banUser(user.id, 'Admin action');

    action$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        if (res.success) {
          const msg = user.isBanned
            ? 'Đã mở khóa tài khoản'
            : 'Đã khóa tài khoản';
          this.toastService.success(msg);
          this._users.update((list) =>
            list.map((u) =>
              u.id === user.id ? { ...u, isBanned: !u.isBanned } : u,
            ),
          );
        }
      },
      error: () => this.toastService.error('Không thể thực hiện'),
    });
  }

  onDeleteUser(user: AdminUser): void {
    if (
      !confirm(
        `Khóa tài khoản "${user.fullName}"? (BE không hỗ trợ xóa vĩnh viễn)`,
      )
    )
      return;
    this.adminService
      .banUser(user.id, 'Xóa tài khoản theo yêu cầu quản trị')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.toastService.success('Đã khóa tài khoản người dùng');
            this._users.update((list) =>
              list.map((u) =>
                u.id === user.id ? { ...u, isBanned: true } : u,
              ),
            );
          }
        },
        error: () => this.toastService.error('Không thể khóa tài khoản'),
      });
  }

  onDeletePost(post: AdminPost): void {
    if (!confirm('Xóa bài viết này?')) return;
    this.adminService
      .deletePost(post.id, 'Admin action')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.toastService.success('Đã xóa bài viết');
            this.adminPosts.update((list) =>
              list.filter((p) => p.id !== post.id),
            );
          }
        },
      });
  }

  onDismissReport(report: Report): void {
    this.reports.update((list) => list.filter((r) => r.id !== report.id));
    this.toastService.success('Đã bỏ qua báo cáo');
  }

  onActOnReport(_report: Report): void {
    this.toastService.info('Tính năng xử lý báo cáo đang phát triển');
  }

  // Nguyên tắc: fallback CSS opacity:1. .gsap-ready thêm will-change hints.
  // prefers-reduced-motion được check trước khi tạo bất kỳ animation nào.

  /** Page entrance: host + header banner + panel */
  private setupPageEntrance(): void {
    this.renderer.addClass(this.el.nativeElement, 'gsap-ready');
    const host = this.el.nativeElement;

    // Cả trang fade + slide lên nhẹ
    const t1 = gsap.from(host, {
      autoAlpha: 0,
      y: 12,
      duration: 0.4,
      ease: 'power2.out',
    });
    this.tweens.push(t1);

    // Header banner từ trên xuống
    const headerInner = host.querySelector(
      '.adm-header-inner',
    ) as HTMLElement | null;
    if (headerInner) {
      const t2 = gsap.from(headerInner, {
        autoAlpha: 0,
        y: -12,
        duration: 0.5,
        ease: 'power2.out',
        delay: 0.06,
      });
      this.tweens.push(t2);
    }

    // Main panel từ dưới lên
    const panel = host.querySelector('.adm-panel') as HTMLElement | null;
    if (panel) {
      const t3 = gsap.from(panel, {
        autoAlpha: 0,
        y: 20,
        duration: 0.55,
        ease: 'power3.out',
        delay: 0.12,
      });
      this.tweens.push(t3);
    }
  }

  /** Stat cards stagger + number count-up */
  private animateStatCards(): void {
    const host = this.el.nativeElement;
    const cards = host.querySelectorAll(
      '.adm-stat-card:not(.adm-skel-card)',
    ) as NodeListOf<HTMLElement>;
    if (!cards.length) return;

    // Stagger entrance: fade + scale + y
    const tEntrance = gsap.from(cards, {
      autoAlpha: 0,
      y: 22,
      scale: 0.96,
      duration: 0.6,
      ease: 'power3.out',
      stagger: 0.07,
      clearProps: 'scale',
    });
    this.tweens.push(tEntrance);

    // Count-up cho mỗi stat value có giá trị > 0
    cards.forEach((card) => {
      const valueEl = card.querySelector(
        '.adm-stat-value',
      ) as HTMLElement | null;
      if (!valueEl) return;

      // Đọc giá trị Angular đã render (e.g. "1,234")
      const rawText = (valueEl.textContent ?? '').replace(/[\s,.\u00a0]/g, '');
      const finalNum = parseInt(rawText, 10);
      if (!isFinite(finalNum) || finalNum <= 0) return;

      const proxy = { val: 0 };
      const tCounter = gsap.to(proxy, {
        val: finalNum,
        duration: 1.4,
        ease: 'power2.out',
        delay: 0.25,
        onUpdate() {
          // Format giống Angular | number pipe (en-US locale)
          valueEl.textContent = Math.round(proxy.val).toLocaleString('en-US');
        },
        onComplete() {
          valueEl.textContent = finalNum.toLocaleString('en-US');
        },
      });
      this.tweens.push(tCounter);
    });
  }

  /** Tab panel fade-in khi switch tab */
  private animateTabPanel(): void {
    const panel = this.el.nativeElement.querySelector(
      '.adm-tab-panel',
    ) as HTMLElement | null;
    if (!panel) return;
    const t = gsap.from(panel, {
      autoAlpha: 0,
      y: 10,
      duration: 0.32,
      ease: 'power2.out',
    });
    this.tweens.push(t);
  }

  /** Table rows stagger từ trái sang phải */
  private animateTableRows(): void {
    const rows = this.el.nativeElement.querySelectorAll(
      '.adm-tr',
    ) as NodeListOf<HTMLElement>;
    if (!rows.length) return;
    const t = gsap.from(rows, {
      autoAlpha: 0,
      x: -8,
      duration: 0.38,
      ease: 'power2.out',
      stagger: 0.035,
    });
    this.tweens.push(t);
  }
}
