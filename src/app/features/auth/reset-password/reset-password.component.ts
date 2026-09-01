import { Component, signal, inject, OnInit } from '@angular/core';
import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  AbstractControl,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private email = '';
  private verifyToken = '';

  step = signal<1 | 2>(1);
  done = signal(false);
  isLoading = signal(false);
  error = signal<string | null>(null);
  showPw = signal(false);
  showCPw = signal(false);

  // Bước 1: chỉ OTP
  readonly otpForm = this.fb.group({
    token: [
      '',
      [Validators.required, Validators.minLength(6), Validators.maxLength(6)],
    ],
  });

  // Bước 2: mật khẩu mới
  readonly pwForm = this.fb.group(
    {
      newPassword: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.pattern(/(?=.*[A-Z])(?=.*[0-9])/),
        ],
      ],
      confirmPassword: ['', Validators.required],
    },
    { validators: this.passwordMatch },
  );

  private passwordMatch(ctrl: AbstractControl) {
    const pw = ctrl.get('newPassword')?.value;
    const cpw = ctrl.get('confirmPassword')?.value;
    return pw && cpw && pw !== cpw ? { mismatch: true } : null;
  }

  ngOnInit(): void {
    const state = history.state;
    this.email = state?.['email'] ?? '';
    if (!this.email) {
      this.router.navigate(['/auth/forgot-password']);
    }
  }

  otpFieldError(): string | null {
    const c = this.otpForm.get('token');
    if (!c || !c.touched || c.valid) return null;
    if (c.hasError('required')) return 'Vui lòng nhập mã OTP.';
    if (c.hasError('minlength') || c.hasError('maxlength'))
      return 'OTP phải đủ 6 chữ số.';
    return null;
  }

  pwFieldError(name: string): string | null {
    const c = this.pwForm.get(name);
    if (!c || !c.touched || c.valid) return null;
    if (c.hasError('required')) return 'Trường này không được để trống.';
    if (c.hasError('minlength')) return 'Mật khẩu tối thiểu 8 ký tự.';
    if (c.hasError('pattern')) return 'Mật khẩu cần ít nhất 1 chữ hoa và 1 số.';
    return null;
  }

  togglePw(): void {
    this.showPw.update((v) => !v);
  }
  toggleCPw(): void {
    this.showCPw.update((v) => !v);
  }

  // Bước 1: gọi API verify-otp — đúng mới sang bước 2
  onStep1(): void {
    this.otpForm.markAllAsTouched();
    if (this.otpForm.invalid || this.isLoading()) return;

    this.error.set(null);
    this.isLoading.set(true);

    this.auth.verifyOtp(this.email, this.otpForm.value.token!).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.verifyToken = res.data.verifyToken;
        this.step.set(2);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.otpForm.reset();
        this.error.set(
          err?.error?.message ?? 'OTP không hợp lệ hoặc đã hết hạn.',
        );
        // Ở lại bước 1 — không cho sang bước 2
      },
    });
  }

  // Bước 2: đặt mật khẩu mới bằng verifyToken
  onStep2(): void {
    this.pwForm.markAllAsTouched();
    if (this.pwForm.invalid || this.isLoading()) return;

    this.error.set(null);
    this.isLoading.set(true);

    const { newPassword, confirmPassword } = this.pwForm.value;

    this.auth
      .resetPassword({
        email: this.email,
        verifyToken: this.verifyToken,
        newPassword: newPassword!,
        confirmNewPassword: confirmPassword!,
      })
      .subscribe({
        next: () => {
          this.isLoading.set(false);
          this.done.set(true);
          setTimeout(() => this.router.navigate(['/auth/login']), 3000);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.step.set(1);
          this.verifyToken = '';
          this.otpForm.reset();
          this.error.set(
            err?.error?.message ??
              'Phiên đặt lại đã hết hạn. Vui lòng nhập OTP mới.',
          );
        },
      });
  }

  goBack(): void {
    this.error.set(null);
    this.step.set(1);
  }
}
