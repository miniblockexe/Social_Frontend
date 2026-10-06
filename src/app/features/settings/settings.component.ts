import {
  Component,
  ElementRef,
  OnInit,
  OnDestroy,
  ViewChild,
  computed,
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
import { OtpInputComponent } from '../../shared/components/otp-input/otp-input.component';
import { AccountSecurity } from '../../core/models/auth.models';
import {
  PrivacySettings,
  PrivacyVisibility,
} from '../../core/models/user.models';
import {
  AppearanceService,
  AppearanceSettings,
} from '../../core/services/appearance.service';

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

// UI dùng string ('public'/'friends'/'private') cho <select>, BE dùng enum PrivacyVisibility.
// 2 map này chuyển đổi qua lại — chỉ dùng nội bộ khi gọi API, không đụng tới HTML.
const VISIBILITY_TO_STRING: Record<PrivacyVisibility, string> = {
  [PrivacyVisibility.Public]: 'public',
  [PrivacyVisibility.Friends]: 'friends',
  [PrivacyVisibility.OnlyMe]: 'private',
};

const STRING_TO_VISIBILITY: Record<string, PrivacyVisibility> = {
  public: PrivacyVisibility.Public,
  friends: PrivacyVisibility.Friends,
  private: PrivacyVisibility.OnlyMe,
};

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RingtoneEditorComponent,
    OtpInputComponent,
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
  private readonly appearanceService = inject(AppearanceService);

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

  // ── Bảo mật: email + hasPassword, luồng OTP đặt mật khẩu ─────────
  securityInfo = signal<AccountSecurity | null>(null);
  /** Đã gọi xong /auth/security-info (thành công hay lỗi) — tránh nháy form sai lúc đang tải */
  securityLoaded = signal(false);
  /** User đã có mật khẩu nhưng chọn "Quên mật khẩu hiện tại?" */
  otpFlowOpen = signal(false);
  /** Tài khoản Google chưa có mật khẩu → luôn dùng luồng OTP */
  showOtpFlow = computed(() => {
    const info = this.securityInfo();
    return !!info && (!info.hasPassword || this.otpFlowOpen());
  });
  otpStep = signal<'intro' | 'otp' | 'password'>('intro');
  otpSending = signal(false);
  otpVerifying = signal(false);
  otpResetting = signal(false);
  otpError = signal<string | null>(null);
  resendCooldown = signal(0);
  private otpValue = '';
  private verifyToken = '';
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;
  @ViewChild(OtpInputComponent) otpInput?: OtpInputComponent;

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

  // Load từ AppearanceService (đã đọc từ localStorage)
  appearanceSettings: AppearanceSettings = {
    ...this.appearanceService.settings(),
  };

  profileForm!: FormGroup;
  passwordForm!: FormGroup;
  setPasswordForm!: FormGroup;

  ngOnInit(): void {
    // Sync lại từ service mỗi lần vào trang (phòng trường hợp service đã cập nhật)
    this.appearanceSettings = { ...this.appearanceService.settings() };
    this.prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    this._buildForms();
    this._loadSecurityInfo();
    this._loadCurrentBio();
    this._loadPrivacySettings();
    this._loadRingtone();
    this._loadGSAP();
  }

  ngOnDestroy(): void {
    this.gsapCtx?.revert();
    this._clearCooldown();
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

    this.setPasswordForm = this.fb.group(
      {
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

  private _loadPrivacySettings(): void {
    this.userService.getPrivacySettings().subscribe({
      next: (res) => {
        if (res.success) {
          const d = res.data;
          this.privacySettings = {
            profileVisibility: VISIBILITY_TO_STRING[d.profileVisibility],
            postVisibility: VISIBILITY_TO_STRING[d.postVisibility],
            friendListVisible: VISIBILITY_TO_STRING[d.friendListVisible],
            searchDiscoverable: VISIBILITY_TO_STRING[d.searchDiscoverable],
          };
        }
      },
      error: () => {
        // Giữ giá trị mặc định trong privacySettings nếu tải thất bại
      },
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

  onAvatarChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.userService.updateAvatar(file).subscribe({
      next: (res) => {
        const u = this.currentUser();
        if (u) this.auth.currentUser.set({ ...u, avatarUrl: res.data });
        this.toast.show('Đã cập nhật ảnh đại diện', 'success');
      },
      error: (err) => {
        // Hiện đúng message server trả về (sai định dạng, quá dung lượng...)
        const tooLarge = err?.status === 413 || err?.status === 502;
        this.toast.show(
          err?.error?.message ??
            (tooLarge
              ? 'Ảnh quá lớn. Vui lòng chọn ảnh tối đa 5MB.'
              : 'Không thể cập nhật ảnh đại diện'),
          'error',
        );
      },
    });

    input.value = '';
  }

  checkPasswordStrength(form: FormGroup = this.passwordForm): void {
    const pw: string = form.get('newPassword')?.value ?? '';
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

  onEditorApplied(croppedFile: File): void {
    this.editorFile.set(null);

    const MAX_BYTES = 5 * 1024 * 1024;
    if (croppedFile.size > MAX_BYTES) {
      const sizeMb = (croppedFile.size / 1024 / 1024).toFixed(1);
      this.toast.show(
        `File quá lớn (${sizeMb} MB). Vui lòng cắt ngắn hơn.`,
        'error',
      );
      return;
    }

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
      audio.load();
      audio
        .play()
        .then(() => {
          this.isPlaying.set(true);
          audio.onended = () => this.isPlaying.set(false);
        })
        .catch((err) => {
          console.warn('Không thể phát nhạc chuông:', err);
          this.isPlaying.set(false);
          this.toast.show('Không thể phát nhạc chuông', 'error');
        });
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

  // ══════════════════════════════════════════════════════════════
  // OTP: đặt mật khẩu lần đầu (Google) / quên mật khẩu hiện tại
  // ══════════════════════════════════════════════════════════════

  private _loadSecurityInfo(): void {
    this.auth.getSecurityInfo().subscribe({
      next: (res) => {
        if (res.success) this.securityInfo.set(res.data);
        this.securityLoaded.set(true);
      },
      error: () => {
        // Không lấy được → giữ form đổi mật khẩu mặc định (securityInfo = null)
        this.securityLoaded.set(true);
      },
    });
  }

  openOtpFlow(): void {
    this._resetOtpFlow();
    this.otpFlowOpen.set(true);
  }

  closeOtpFlow(): void {
    this._resetOtpFlow();
    this.otpFlowOpen.set(false);
  }

  private _resetOtpFlow(): void {
    this.otpStep.set('intro');
    this.otpError.set(null);
    this.otpValue = '';
    this.verifyToken = '';
    this.setPasswordForm.reset();
    this.passwordStrength.set(0);
    this._clearCooldown();
  }

  sendOtp(): void {
    if (this.otpSending() || this.resendCooldown() > 0) return;
    this.otpSending.set(true);
    this.otpError.set(null);

    this.auth.sendSetPasswordOtp().subscribe({
      next: () => {
        this.otpSending.set(false);
        this.otpValue = '';
        this.otpInput?.reset();
        this.otpStep.set('otp');
        this._startCooldown(60);
        this.toast.show('Đã gửi mã OTP tới email của bạn', 'success');
      },
      error: (err) => {
        this.otpSending.set(false);
        const msg =
          err?.status === 429
            ? 'Bạn yêu cầu quá nhiều lần. Vui lòng thử lại sau ít phút.'
            : (err?.error?.message ?? 'Không thể gửi mã OTP. Vui lòng thử lại.');
        this.otpError.set(msg);
      },
    });
  }

  onOtpChange(value: string): void {
    this.otpValue = value;
    if (this.otpError()) this.otpError.set(null);
  }

  verifyOtp(): void {
    const email = this.securityInfo()?.email;
    if (!email || this.otpVerifying()) return;
    if (this.otpValue.length < 6) {
      this.otpError.set('Vui lòng nhập đủ 6 chữ số.');
      return;
    }
    this.otpVerifying.set(true);
    this.otpError.set(null);

    this.auth.verifyOtp(email, this.otpValue).subscribe({
      next: (res) => {
        this.otpVerifying.set(false);
        this.verifyToken = res.data.verifyToken;
        this.otpStep.set('password');
      },
      error: (err) => {
        this.otpVerifying.set(false);
        this.otpInput?.reset();
        this.otpError.set(
          err?.error?.message ?? 'OTP không hợp lệ hoặc đã hết hạn.',
        );
      },
    });
  }

  saveNewPasswordViaOtp(): void {
    const email = this.securityInfo()?.email;
    if (!email || this.otpResetting()) return;
    if (this.setPasswordForm.invalid) {
      this.setPasswordForm.markAllAsTouched();
      return;
    }
    this.otpResetting.set(true);
    this.otpError.set(null);

    const { newPassword, confirmPassword } = this.setPasswordForm.value;
    this.auth
      .resetPassword({
        email,
        verifyToken: this.verifyToken,
        newPassword,
        confirmNewPassword: confirmPassword,
      })
      .subscribe({
        next: () => {
          this.otpResetting.set(false);
          this.toast.show(
            'Đã đặt mật khẩu. Vui lòng đăng nhập lại.',
            'success',
          );
          // BE thu hồi toàn bộ refresh token sau khi đặt mật khẩu → đăng xuất
          setTimeout(() => this.auth.logout(), 1200);
        },
        error: (err) => {
          this.otpResetting.set(false);
          this.verifyToken = '';
          this.otpValue = '';
          this.otpStep.set('otp');
          this.otpError.set(
            err?.error?.message ?? 'Phiên đã hết hạn. Vui lòng nhập OTP mới.',
          );
        },
      });
  }

  private _startCooldown(seconds: number): void {
    this._clearCooldown();
    this.resendCooldown.set(seconds);
    this.cooldownTimer = setInterval(() => {
      const next = this.resendCooldown() - 1;
      this.resendCooldown.set(Math.max(next, 0));
      if (next <= 0) this._clearCooldown();
    }, 1000);
  }

  private _clearCooldown(): void {
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }
    this.resendCooldown.set(0);
  }

  savePrivacy(): void {
    this.privacySaving.set(true);

    const dto: PrivacySettings = {
      profileVisibility:
        STRING_TO_VISIBILITY[this.privacySettings['profileVisibility']],
      postVisibility:
        STRING_TO_VISIBILITY[this.privacySettings['postVisibility']],
      friendListVisible:
        STRING_TO_VISIBILITY[this.privacySettings['friendListVisible']],
      searchDiscoverable:
        STRING_TO_VISIBILITY[this.privacySettings['searchDiscoverable']],
    };

    this.userService.updatePrivacySettings(dto).subscribe({
      next: (res) => {
        this.privacySaving.set(false);
        if (res.success) {
          this.toast.show('Đã cập nhật cài đặt quyền riêng tư', 'success');
        }
      },
      error: (err) => {
        this.privacySaving.set(false);
        const msg = err?.error?.message ?? 'Không thể cập nhật quyền riêng tư';
        this.toast.show(msg, 'error');
      },
    });
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
      // Lưu vào localStorage và áp dụng ngay lên DOM
      this.appearanceService.save({ ...this.appearanceSettings });
      this.appearanceSaving.set(false);
      this.toast.show('Đã cập nhật giao diện', 'success');
    }, 700);
  }

  onLogout(): void {
    this.auth.logout();
    this.router.navigate(['/auth/login']);
  }
}
