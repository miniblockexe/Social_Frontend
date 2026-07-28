import {
  Component,
  AfterViewInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  AbstractControl,
  ValidatorFn,
  ValidationErrors,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

gsap.registerPlugin(ScrollTrigger);

/* ── Cross-field password match validator ── */
const passwordMatchValidator: ValidatorFn = (
  group: AbstractControl,
): ValidationErrors | null => {
  const pw = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return pw === confirm ? null : { passwordMismatch: true };
};

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent implements AfterViewInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly toastService = inject(ToastService);

  /* ── Reactive state ──────────────────────── */
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  showPassword = signal(false);
  showConfirmPassword = signal(false);

  /** 1 = info (name + username) · 2 = credentials (email + password + confirm + terms) */
  currentStep = signal<1 | 2>(1);

  /* ── GSAP ────────────────────────────────── */
  private gsapTl?: gsap.core.Timeline;
  private readonly reducedMotion =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  /* ── Form ────────────────────────────────── */
  readonly registerForm = this.fb.group(
    {
      fullName: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(100),
        ],
      ],
      username: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(50),
          Validators.pattern(/^[a-zA-Z0-9._]+$/),
        ],
      ],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
      acceptTerms: [false, Validators.requiredTrue],
    },
    { validators: passwordMatchValidator },
  );

  /* ── Step 1 validity ── */
  get step1Valid(): boolean {
    const fn = this.registerForm.get('fullName');
    const un = this.registerForm.get('username');
    return !!fn && fn.valid && !!un && un.valid;
  }

  /* ── Password strength (computed signal) ── */
  readonly passwordStrength = computed<number>(() => {
    const pwd = this.registerForm.get('password')?.value ?? '';
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^a-zA-Z0-9]/.test(pwd)) score++;
    return score;
  });

  readonly passwordStrengthLabel = computed<string>(() => {
    switch (this.passwordStrength()) {
      case 1:
        return 'Yếu';
      case 2:
        return 'Trung bình';
      case 3:
        return 'Mạnh';
      case 4:
        return 'Rất mạnh';
      default:
        return '';
    }
  });

  /* ── Helpers for template ── */
  isInvalid(controlName: string): boolean {
    const c = this.registerForm.get(controlName);
    return !!c && c.invalid && c.touched;
  }

  getError(controlName: string, errorKey: string): boolean {
    const c = this.registerForm.get(controlName);
    return !!c && !!c.errors?.[errorKey] && c.touched;
  }

  hasMismatch(): boolean {
    const confirm = this.registerForm.get('confirmPassword');
    return (
      !!this.registerForm.errors?.['passwordMismatch'] && !!confirm?.touched
    );
  }

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }
  toggleConfirmPassword(): void {
    this.showConfirmPassword.update((v) => !v);
  }

  /* ── Step navigation ─────────────────────── */
  goToStep2(): void {
    const fullName = this.registerForm.get('fullName');
    const username = this.registerForm.get('username');
    fullName?.markAsTouched();
    username?.markAsTouched();

    if (!this.step1Valid) return;

    this.animateStepTransition(() => {
      this.currentStep.set(2);
      this.animateStepIn();
    });
  }

  goBack(): void {
    this.animateStepTransition(() => {
      this.currentStep.set(1);
      this.animateStepIn();
    });
  }

  /* ── Step transition animation ── */
  private animateStepTransition(onComplete: () => void): void {
    if (this.reducedMotion) {
      onComplete();
      return;
    }
    const stepEl = document.getElementById('stepContent');
    if (!stepEl) {
      onComplete();
      return;
    }
    gsap.to(stepEl, {
      opacity: 0,
      x: this.currentStep() === 1 ? -18 : 18,
      duration: 0.22,
      ease: 'power2.in',
      onComplete,
    });
  }

  private animateStepIn(): void {
    if (this.reducedMotion) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const stepEl = document.getElementById('stepContent');
        if (!stepEl) return;
        gsap.fromTo(
          stepEl,
          { opacity: 0, x: this.currentStep() === 1 ? 18 : -18 },
          { opacity: 1, x: 0, duration: 0.28, ease: 'power2.out' },
        );
        const fields = stepEl.querySelectorAll(
          '.form-group, .terms-row, .btn-submit, .step-nav-row',
        );
        gsap.fromTo(
          fields,
          { opacity: 0, y: 10 },
          {
            opacity: 1,
            y: 0,
            duration: 0.3,
            stagger: 0.055,
            ease: 'power2.out',
            delay: 0.08,
          },
        );
      });
    });
  }

  /* ── Submit ─────────────────────────────── */
  onSubmit(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.isLoading.set(true);

    const { fullName, username, email, password, confirmPassword } =
      this.registerForm.getRawValue();

    this.authService
      .register({
        fullName: fullName!,
        username: username!,
        email: email!,
        password: password!,
        confirmPassword: confirmPassword!,
      })
      .subscribe({
        next: () => {
          this.authService.login(email!, password!).subscribe({
            next: () => {
              this.isLoading.set(false);
              this.router.navigate(['/home']);
            },
            error: () => {
              this.isLoading.set(false);
              this.router.navigate(['/auth/login']);
            },
          });
        },
        error: (err: HttpErrorResponse) => {
          this.isLoading.set(false);
          if (err.status === 409) {
            this.errorMessage.set('Email hoặc tên đăng nhập đã tồn tại.');
          } else if (err.status === 422) {
            const errors: string[] = err.error?.errors ?? [];
            this.errorMessage.set(
              errors.length ? errors.join('\n') : 'Dữ liệu không hợp lệ.',
            );
          } else {
            this.errorMessage.set('Đã xảy ra lỗi. Vui lòng thử lại.');
          }
          this.animateErrorBanner();
        },
      });
  }

  private animateErrorBanner(): void {
    if (this.reducedMotion) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.getElementById('errorBanner');
        if (el) {
          gsap.fromTo(
            el,
            { opacity: 0, y: -8 },
            { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' },
          );
        }
      });
    });
  }

  /* ── GSAP Entrance Animation ────────────── */
  ngAfterViewInit(): void {
    if (this.reducedMotion) {
      this.applyStaticFallback();
      return;
    }

    ScrollTrigger.refresh();

    this.gsapTl = gsap
      .timeline({ defaults: { ease: 'power3.out' } })

      .to(
        '.orb--teal',
        {
          opacity: 0.2,
          duration: 1.4,
          ease: 'cubic-bezier(0.16,1,0.3,1)',
        },
        0,
      )
      .to(
        '.orb--red',
        {
          opacity: 0.15,
          duration: 1.4,
          ease: 'cubic-bezier(0.16,1,0.3,1)',
        },
        0.1,
      )
      .to(
        '#gsapCard',
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.7,
          ease: 'cubic-bezier(0.16,1,0.3,1)',
        },
        0.2,
      )
      .to(
        '#gsapHeader',
        {
          opacity: 1,
          y: 0,
          duration: 0.45,
          ease: 'power2.out',
        },
        0.38,
      )
      .to(
        '#stepContent',
        {
          opacity: 1,
          y: 0,
          duration: 0.42,
          ease: 'power2.out',
        },
        0.5,
      )
      .to(
        '.form-group, .btn-next, .step-indicators',
        {
          opacity: 1,
          y: 0,
          duration: 0.38,
          stagger: 0.055,
          ease: 'power2.out',
        },
        0.56,
      )
      .to(
        '#gsapFooter',
        {
          opacity: 1,
          y: 0,
          duration: 0.38,
          ease: 'power2.out',
        },
        0.72,
      );
  }

  ngOnDestroy(): void {
    this.gsapTl?.kill();
    // Kill tất cả tweens còn lại của component này để tránh leak sang page kế tiếp
    gsap.killTweensOf([
      '#gsapCard',
      '#gsapHeader',
      '#stepContent',
      '#gsapFooter',
      '#gsapSubmit',
      '#errorBanner',
      '.orb--teal',
      '.orb--red',
      '.form-group',
      '.step-indicators',
    ]);
  }

  private applyStaticFallback(): void {
    const card = document.getElementById('gsapCard');
    if (card) Object.assign(card.style, { opacity: '1', transform: 'none' });
    document.querySelectorAll<HTMLElement>('.entrance-hidden').forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    const orbTeal = document.querySelector<HTMLElement>('.orb--teal');
    const orbRed = document.querySelector<HTMLElement>('.orb--red');
    if (orbTeal) orbTeal.style.opacity = '0.2';
    if (orbRed) orbRed.style.opacity = '0.15';
  }
}
