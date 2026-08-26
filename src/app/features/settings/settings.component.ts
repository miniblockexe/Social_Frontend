import {
  Component,
  ElementRef,
  OnInit,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { trigger, transition, style, animate } from '@angular/animations';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { ToastService } from '../../core/services/toast.service';
import { WebRtcService } from '../../core/services/webrtc.service';
import { RingtoneEditorComponent } from './ringtone-editor/ringtone-editor.component';

export type SettingsSection =
  | 'profile'
  | 'security'
  | 'privacy'
  | 'notifications'
  | 'appearance'
  | 'ringtone';

interface NavItem {
  key: SettingsSection;
  label: string;
  icon: string;
  color: 'red' | 'teal' | 'amber' | 'purple' | 'gray';
}

interface PrivacyItem {
  key: string;
  label: string;
  desc: string;
}

interface NotifItem {
  key: string;
  label: string;
  desc: string;
}

function passwordMatchValidator(
  group: AbstractControl,
): ValidationErrors | null {
  const nw = group.get('newPassword')?.value;
  const cf = group.get('confirmPassword')?.value;
  return nw && cf && nw !== cf ? { mismatch: true } : null;
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #ff4d3d, #f5a623)',
  'linear-gradient(135deg, #00d4a8, #0099ff)',
  'linear-gradient(135deg, #a855f7, #ec4899)',
  'linear-gradient(135deg, #f5a623, #f59e0b)',
];

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RingtoneEditorComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  animations: [
    trigger('sectionFade', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(8px)' }),
        animate(
          '250ms ease-out',
          style({ opacity: 1, transform: 'translateY(0)' }),
        ),
      ]),
    ]),
  ],
})
export class SettingsComponent implements OnInit, OnDestroy {
  @ViewChild('settingsPage') private settingsPage!: ElementRef<HTMLElement>;
  @ViewChild('sidebarEl') private sidebarEl!: ElementRef<HTMLElement>;
  @ViewChild('contentPanel') private contentPanel!: ElementRef<HTMLElement>;
  @ViewChild('avatarInput') private avatarInput!: ElementRef<HTMLInputElement>;
  @ViewChild('ringtoneInput')
  private ringtoneInput!: ElementRef<HTMLInputElement>;
  @ViewChild('audioPreview')
  private audioPreview!: ElementRef<HTMLAudioElement>;

  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly webRtcService = inject(WebRtcService);

  currentUser = this.auth.currentUser;
  activeSection = signal<SettingsSection>('profile');

  // Bio state (UserBrief không có bio, phải fetch riêng)
  currentBio = signal<string>('');

  // Saving states
  profileSaving = signal(false);
  passwordSaving = signal(false);
  privacySaving = signal(false);
  notifSaving = signal(false);
  appearanceSaving = signal(false);
  profileSaved = signal(false);
  passwordSaved = signal(false);

  // Password visibility
  showCurrentPw = signal(false);
  showNewPw = signal(false);
  showConfirmPw = signal(false);
  passwordStrength = signal(0);

  // Ringtone
  currentRingtoneUrl = signal<string | null>(null);
  ringtoneSaving = signal(false);
  ringtoneDeleting = signal(false);
  isPlaying = signal(false);

  // ── Ringtone editor ──────────────────────────────────────────────
  /** File đang chờ edit; khi có giá trị thì hiện RingtoneEditorComponent */
  editorFile = signal<File | null>(null);

  private gsap: any;
  private gsapCtx: any;
  private prefersReducedMotion = false;

  readonly navItems: NavItem[] = [
    {
      key: 'profile',
      label: 'Thông tin cá nhân',
      icon: 'fa-solid fa-user',
      color: 'red',
    },
    {
      key: 'security',
      label: 'Tài khoản & Bảo mật',
      icon: 'fa-solid fa-shield-halved',
      color: 'teal',
    },
    {
      key: 'privacy',
      label: 'Quyền riêng tư',
      icon: 'fa-solid fa-lock',
      color: 'amber',
    },
    {
      key: 'notifications',
      label: 'Thông báo',
      icon: 'fa-solid fa-bell',
      color: 'purple',
    },
    {
      key: 'appearance',
      label: 'Giao diện',
      icon: 'fa-solid fa-palette',
      color: 'gray',
    },
    {
      key: 'ringtone',
      label: 'Nhạc chuông',
      icon: 'fa-solid fa-music',
      color: 'purple',
    },
  ];

  readonly privacyItems: PrivacyItem[] = [
    {
      key: 'profileVisibility',
      label: 'Hiển thị trang cá nhân',
      desc: 'Ai có thể xem trang cá nhân của bạn.',
    },
    {
      key: 'postVisibility',
      label: 'Hiển thị bài viết',
      desc: 'Ai có thể thấy bài viết bạn đăng.',
    },
    {
      key: 'friendListVisible',
      label: 'Danh sách bạn bè',
      desc: 'Ai có thể xem danh sách bạn bè của bạn.',
    },
    {
      key: 'searchDiscoverable',
      label: 'Tìm kiếm',
      desc: 'Cho phép người khác tìm thấy bạn qua tìm kiếm.',
    },
  ];

  privacySettings: Record<string, string> = {
    profileVisibility: 'public',
    postVisibility: 'friends',
    friendListVisible: 'friends',
    searchDiscoverable: 'public',
  };

  readonly notifItems: NotifItem[] = [
    {
      key: 'likes',
      label: 'Lượt thích',
      desc: 'Khi ai đó thích bài viết của bạn.',
    },
    {
      key: 'comments',
      label: 'Bình luận',
      desc: 'Khi ai đó bình luận bài viết của bạn.',
    },
    {
      key: 'friendReqs',
      label: 'Lời mời kết bạn',
      desc: 'Khi có người gửi lời mời kết bạn mới.',
    },
    {
      key: 'mentions',
      label: 'Nhắc đến',
      desc: 'Khi ai đó nhắc đến bạn trong bài viết.',
    },
    {
      key: 'messages',
      label: 'Tin nhắn mới',
      desc: 'Thông báo khi có tin nhắn chưa đọc.',
    },
  ];

  notifSettings: Record<string, boolean> = {
    likes: true,
    comments: true,
    friendReqs: true,
    mentions: true,
    messages: true,
  };

  appearanceSettings = {
    language: 'vi',
    animations: true,
    compact: false,
  };

  profileForm!: FormGroup;
  passwordForm!: FormGroup;

  ngOnInit(): void {
    this.prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    this._buildForms();
    this._loadCurrentBio();
    this._loadRingtone();
    this._loadGSAP();
  }

  ngOnDestroy(): void {
    this.gsapCtx?.revert();
  }

  private _buildForms(): void {
    const u = this.currentUser();

    this.profileForm = this.fb.group({
      fullName: [
        u?.fullName ?? '',
        [Validators.required, Validators.minLength(2)],
      ],
      username: [
        u?.username ?? '',
        [Validators.required, Validators.pattern(/^[a-zA-Z0-9_.]{3,30}$/)],
      ],
      bio: ['', Validators.maxLength(160)],
    });

    this.passwordForm = this.fb.group(
      {
        currentPassword: ['', Validators.required],
        newPassword: [
          '',
          [
            Validators.required,
            Validators.minLength(8),
            Validators.pattern(
              /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).+$/,
            ),
          ],
        ],
        confirmPassword: ['', Validators.required],
      },
      { validators: passwordMatchValidator },
    );

    // Reset saved khi user nhập lại
    this.profileForm.valueChanges.subscribe(() => {
      if (this.profileSaved()) this.profileSaved.set(false);
    });

    this.passwordForm.valueChanges.subscribe(() => {
      if (this.passwordSaved()) this.passwordSaved.set(false);
    });
  }

  private _loadCurrentBio(): void {
    this.userService.getMyProfile().subscribe({
      next: (res) => {
        if (res.success) {
          const bio = res.data.bio ?? '';
          this.currentBio.set(bio);
          this.profileForm.patchValue({ bio }, { emitEvent: false });
        }
      },
      error: () => {},
    });
  }

  private async _loadGSAP(): Promise<void> {
    try {
      const gsapModule = await import('gsap');
      this.gsap = gsapModule.gsap ?? gsapModule.default;

      // Delay raf cho DOM ready
      requestAnimationFrame(() => this._runEntrance());
    } catch {
      // GSAP không load được — CSS fallback vẫn hoạt động vì opacity:1 mặc định
    }
  }

  private _runEntrance(): void {
    if (this.prefersReducedMotion || !this.gsap) return;

    const gsap = this.gsap;
    this.gsapCtx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      // Sidebar slide in từ trái
      tl.from(this.sidebarEl.nativeElement, {
        x: -24,
        opacity: 0,
        duration: 0.55,
      });

      // Content panel fade in
      tl.from(
        this.contentPanel.nativeElement,
        { x: 16, opacity: 0, duration: 0.45 },
        '-=0.35',
      );

      // Nav items stagger
      tl.from(
        '.sp-settings-nav-item',
        { y: 12, opacity: 0, duration: 0.35, stagger: 0.055 },
        '-=0.3',
      );
    }, this.settingsPage.nativeElement);
  }

  setSection(key: SettingsSection): void {
    if (this.activeSection() === key) return;
    this.activeSection.set(key);

    // Micro-animation — icon bounce
    if (!this.prefersReducedMotion && this.gsap) {
      const activeIcon = document.querySelector(
        `.sp-settings-nav-item.is-active .sp-settings-nav-icon`,
      );
      if (activeIcon) {
        this.gsap.fromTo(
          activeIcon,
          { scale: 0.85 },
          { scale: 1, duration: 0.3, ease: 'back.out(2)' },
        );
      }
    }
  }

  getInitials(): string {
    const name = this.currentUser()?.fullName ?? '';
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  getAvatarGradient(): string {
    const name = this.currentUser()?.fullName ?? '';
    const idx = (name.charCodeAt(0) || 0) % AVATAR_GRADIENTS.length;
    return AVATAR_GRADIENTS[idx];
  }

  triggerAvatarUpload(): void {
    this.avatarInput.nativeElement.click();
  }

  onAvatarChange(_event: Event): void {
    // Avatar upload gọi service — bạn tích hợp BE ở đây
    this.toast.show('Đã cập nhật ảnh đại diện', 'success');
  }

  checkPasswordStrength(): void {
    const pw: string = this.passwordForm.get('newPassword')?.value ?? '';
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    this.passwordStrength.set(score);
  }

  getStrengthColor(): string {
    const s = this.passwordStrength();
    if (s <= 1) return 'red';
    if (s === 2) return 'amber';
    if (s === 3) return 'teal';
    return 'green';
  }

  getStrengthLabel(): string {
    const s = this.passwordStrength();
    if (s === 0) return '';
    if (s === 1) return 'Yếu';
    if (s === 2) return 'Trung bình';
    if (s === 3) return 'Mạnh';
    return 'Rất mạnh';
  }

  private _loadRingtone(): void {
    this.userService.getMyProfile().subscribe({
      next: (res) => {
        if (res.success) {
          const url = (res.data as any).ringtoneUrl ?? null;
          this.currentRingtoneUrl.set(url);
          this.webRtcService.customRingtoneUrl = url;
        }
      },
      error: () => {},
    });
  }

  triggerRingtoneUpload(): void {
    this.ringtoneInput.nativeElement.click();
  }

  /**
   * Không upload ngay — mở editor để user cắt trước
   */
  onRingtoneChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      this.toast.show('File không được vượt quá 5MB', 'error');
      this.ringtoneInput.nativeElement.value = '';
      return;
    }

    // Mở ringtone editor thay vì upload thẳng
    this.editorFile.set(file);
    // Reset input để có thể chọn lại cùng file sau này
    this.ringtoneInput.nativeElement.value = '';
  }

  /**
   * Nhận file đã cắt từ editor → upload lên R2 qua BE
   */
  onEditorApplied(croppedFile: File): void {
    this.editorFile.set(null);
    this.ringtoneSaving.set(true);

    this.userService.updateRingtone(croppedFile).subscribe({
      next: (res) => {
        this.ringtoneSaving.set(false);
        if (res.success) {
          this.currentRingtoneUrl.set(res.data);
          this.webRtcService.customRingtoneUrl = res.data;
          this.toast.show('Đã cập nhật nhạc chuông', 'success');
        }
      },
      error: () => {
        this.ringtoneSaving.set(false);
        this.toast.show('Tải lên thất bại', 'error');
      },
    });
  }

  /**
   * User bấm Huỷ trong editor
   */
  onEditorCancelled(): void {
    this.editorFile.set(null);
  }

  deleteRingtone(): void {
    this.ringtoneDeleting.set(true);
    this.stopPreview();
    this.userService.deleteRingtone().subscribe({
      next: () => {
        this.ringtoneDeleting.set(false);
        this.currentRingtoneUrl.set(null);
        this.webRtcService.customRingtoneUrl = null;
        this.toast.show('Đã xóa nhạc chuông tuỳ chỉnh', 'success');
      },
      error: () => {
        this.ringtoneDeleting.set(false);
        this.toast.show('Xóa thất bại', 'error');
      },
    });
  }

  togglePreview(): void {
    if (this.isPlaying()) {
      this.stopPreview();
    } else {
      const audio = this.audioPreview?.nativeElement;
      if (!audio) return;
      audio.play();
      this.isPlaying.set(true);
      audio.onended = () => this.isPlaying.set(false);
    }
  }

  private stopPreview(): void {
    const audio = this.audioPreview?.nativeElement;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    this.isPlaying.set(false);
  }

  saveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    this.profileSaving.set(true);

    const { fullName, bio } = this.profileForm.value;
    this.userService.updateProfile({ fullName, bio }).subscribe({
      next: (res) => {
        this.profileSaving.set(false);
        if (res.success) {
          const u = this.currentUser();
          if (u) this.auth.currentUser.set({ ...u, fullName });
          // Cập nhật bio local để giữ giá trị sau khi save
          this.currentBio.set(bio ?? '');
          this.profileSaved.set(true);
          this.toast.show('Đã cập nhật thông tin cá nhân', 'success');
        }
      },
      error: () => {
        this.profileSaving.set(false);
        this.toast.show('Cập nhật thất bại', 'error');
      },
    });
  }

  savePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.passwordSaving.set(true);

    const { currentPassword, newPassword, confirmPassword } =
      this.passwordForm.value;
    this.auth
      .changePassword({
        oldPassword: currentPassword,
        newPassword,
        confirmNewPassword: confirmPassword,
      })
      .subscribe({
        next: () => {
          this.passwordSaving.set(false);
          this.passwordForm.reset();
          this.passwordStrength.set(0);
          this.passwordSaved.set(true);
          this.toast.show('Đã đổi mật khẩu thành công', 'success');
        },
        error: (err) => {
          this.passwordSaving.set(false);
          const msg = err?.error?.message ?? 'Mật khẩu hiện tại không đúng';
          this.toast.show(msg, 'error');
        },
      });
  }

  savePrivacy(): void {
    this.privacySaving.set(true);
    setTimeout(() => {
      this.privacySaving.set(false);
      this.toast.show('Đã cập nhật cài đặt quyền riêng tư', 'success');
    }, 700);
  }

  saveNotifications(): void {
    this.notifSaving.set(true);
    setTimeout(() => {
      this.notifSaving.set(false);
      this.toast.show('Đã cập nhật cài đặt thông báo', 'success');
    }, 700);
  }

  saveAppearance(): void {
    this.appearanceSaving.set(true);
    setTimeout(() => {
      this.appearanceSaving.set(false);
      this.toast.show('Đã cập nhật giao diện', 'success');
    }, 700);
  }

  onLogout(): void {
    this.auth.logout();
    this.router.navigate(['/auth/login']);
  }
}
