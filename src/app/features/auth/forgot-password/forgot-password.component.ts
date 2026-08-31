import { Component, signal, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  isLoading = signal(false);
  sent = signal(false); // bước 2: nhập OTP
  error = signal<string | null>(null);
  successMsg = signal<string | null>(null);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  get emailCtrl() {
    return this.form.controls.email;
  }

  get emailError(): string | null {
    const c = this.emailCtrl;
    if (!c.touched || c.valid) return null;
    if (c.hasError('required')) return 'Vui lòng nhập email.';
    if (c.hasError('email')) return 'Email không đúng định dạng.';
    return null;
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isLoading()) return;

    this.error.set(null);
    this.isLoading.set(true);

    this.auth.forgotPassword(this.emailCtrl.value!).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.sent.set(true);
        this.successMsg.set(
          `Nếu email tồn tại, mã OTP đã được gửi đến ${this.emailCtrl.value}. Kiểm tra hộp thư đến (hoặc Spam).`,
        );
      },
      error: () => {
        this.isLoading.set(false);
        // Luôn hiện thành công để tránh user enumeration
        this.sent.set(true);
        this.successMsg.set(
          `Nếu email tồn tại, mã OTP đã được gửi đến ${this.emailCtrl.value}. Kiểm tra hộp thư đến (hoặc Spam).`,
        );
      },
    });
  }
}
