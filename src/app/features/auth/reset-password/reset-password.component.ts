import { Component, signal, inject } from '@angular/core';
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
export class ResetPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  isLoading = signal(false);
  done = signal(false);
  error = signal<string | null>(null);
  showPw = signal(false);
  showCPw = signal(false);

  readonly form = this.fb.group(
    {
      email: ['', [Validators.required, Validators.email]],
      token: [
        '',
        [Validators.required, Validators.minLength(6), Validators.maxLength(6)],
      ],
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

  fieldError(name: string): string | null {
    const c = this.form.get(name);
    if (!c || !c.touched || c.valid) return null;
    if (c.hasError('required')) return 'Trường này không được để trống.';
    if (c.hasError('email')) return 'Email không đúng định dạng.';
    if (c.hasError('minlength'))
      return `Tối thiểu ${c.errors?.['minlength']?.requiredLength} ký tự.`;
    if (c.hasError('maxlength')) return 'OTP chỉ 6 ký tự.';
    if (c.hasError('pattern')) return 'Mật khẩu cần ít nhất 1 chữ hoa và 1 số.';
    if (name === 'confirmPassword' && this.form.hasError('mismatch'))
      return 'Mật khẩu xác nhận không khớp.';
    return null;
  }

  togglePw(): void {
    this.showPw.update((v) => !v);
  }
  toggleCPw(): void {
    this.showCPw.update((v) => !v);
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isLoading()) return;

    this.error.set(null);
    this.isLoading.set(true);

    const { email, token, newPassword, confirmPassword } = this.form.value;

    this.auth
      .resetPassword({
        email: email!,
        token: token!,
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
          this.error.set(
            err?.error?.message ??
              'OTP không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.',
          );
        },
      });
  }
}
