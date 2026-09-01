import { Component, signal, inject, OnInit, ViewChild } from '@angular/core';
import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  AbstractControl,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { OtpInputComponent } from '../../../shared/components/otp-input/otp-input.component';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, OtpInputComponent],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  @ViewChild(OtpInputComponent) otpInput!: OtpInputComponent;

  private email = '';
  private verifyToken = '';
  private otpValue = '';

  step = signal<1 | 2>(1);
  done = signal(false);
  isLoading = signal(false);
  error = signal<string | null>(null);
  otpError = signal(false); // shake animation
  showPw = signal(false);
  showCPw = signal(false);

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

  onOtpChange(value: string): void {
    this.otpValue = value;
    if (this.otpError()) this.otpError.set(false);
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

  onStep1(): void {
    if (this.otpValue.length < 6 || this.isLoading()) {
      this.otpError.set(true);
      this.error.set('Vui lòng nhập đủ 6 chữ số.');
      return;
    }

    this.error.set(null);
    this.isLoading.set(true);

    this.auth.verifyOtp(this.email, this.otpValue).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.verifyToken = res.data.verifyToken;
        this.step.set(2);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.otpError.set(true);
        this.otpInput.reset();
        this.error.set(
          err?.error?.message ?? 'OTP không hợp lệ hoặc đã hết hạn.',
        );
      },
    });
  }

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
          this.otpInput?.reset();
          this.error.set(
            err?.error?.message ?? 'Phiên đã hết hạn. Vui lòng nhập OTP mới.',
          );
        },
      });
  }
}
