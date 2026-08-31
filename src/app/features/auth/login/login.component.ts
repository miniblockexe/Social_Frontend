import {
  Component,
  AfterViewInit,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/models/auth.models';

gsap.registerPlugin(ScrollTrigger);

declare const google: any;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements AfterViewInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /* ── Reactive state ──────────────────────── */
  isLoading = signal(false);
  isGoogleLoading = signal(false);
  errorMessage = signal<string | null>(null);
  showPassword = signal(false);

  /* ── GSAP ────────────────────────────────── */
  private gsapTl?: gsap.core.Timeline;
  private entranceDone = false;
  private readonly reducedMotion =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  /* ── Form ────────────────────────────────── */
  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  get emailCtrl() {
    return this.form.controls.email;
  }
  get passwordCtrl() {
    return this.form.controls.password;
  }

  get emailError(): string | null {
    const c = this.emailCtrl;
    if (!c.touched || c.valid) return null;
    if (c.hasError('required')) return 'Vui lòng nhập email.';
    if (c.hasError('email')) return 'Địa chỉ email không hợp lệ.';
    return null;
  }

  get passwordError(): string | null {
    const c = this.passwordCtrl;
    if (!c.touched || c.valid) return null;
    if (c.hasError('required')) return 'Mật khẩu không được để trống.';
    if (c.hasError('minlength')) return 'Mật khẩu tối thiểu 6 ký tự.';
    return null;
  }

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  /* ── Submit ─────────────────────────────── */
  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isLoading()) return;

    this.errorMessage.set(null);
    this.isLoading.set(true);

    const { email, password } = this.form.value;

    this.auth.login(email!, password!).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success) {
          const dest =
            res.data.user.role === UserRole.Admin ? '/admin' : '/home';
          this.router.navigate([dest]);
        } else {
          this.errorMessage.set(res.message || 'Đăng nhập thất bại.');
          this.animateErrorBanner();
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        const msg =
          err?.error?.message ??
          err?.error?.errors?.[0] ??
          'Email hoặc mật khẩu không đúng. Vui lòng thử lại.';
        this.errorMessage.set(msg);
        this.animateErrorBanner();
      },
    });
  }

  /* ── Google Login ───────────────────────── */
  onGoogleLogin(): void {
    if (typeof google !== 'undefined' && google?.accounts?.id) {
      google.accounts.id.prompt();
    } else {
      this.errorMessage.set('Google Sign-In chưa tải xong. Vui lòng thử lại.');
      this.animateErrorBanner();
    }
  }

  private initGoogleButton(): void {
    const maxWait = 3000;
    const start = Date.now();

    const tryInit = () => {
      if (typeof google !== 'undefined' && google?.accounts?.id) {
        google.accounts.id.initialize({
          client_id:
            '181990983325-06376ui32t35lb5e3q1e1imgku9sokat.apps.googleusercontent.com',
          callback: (response: { credential: string }) => {
            this.handleGoogleCredential(response.credential);
          },
        });
      } else if (Date.now() - start < maxWait) {
        setTimeout(tryInit, 200);
      }
    };

    tryInit();
  }

  private handleGoogleCredential(idToken: string): void {
    this.isGoogleLoading.set(true);
    this.errorMessage.set(null);

    this.auth.googleLogin(idToken).subscribe({
      next: (res) => {
        this.isGoogleLoading.set(false);
        if (res.success) {
          const dest =
            res.data.user.role === UserRole.Admin ? '/admin' : '/home';
          this.router.navigate([dest]);
        } else {
          this.errorMessage.set(res.message || 'Đăng nhập Google thất bại.');
          this.animateErrorBanner();
        }
      },
      error: (err) => {
        this.isGoogleLoading.set(false);
        const msg =
          err?.error?.message ?? 'Đăng nhập Google thất bại. Vui lòng thử lại.';
        this.errorMessage.set(msg);
        this.animateErrorBanner();
      },
    });
  }

  /* ── Error banner animation ─────────────── */
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

  /* ── GSAP Entrance ──────────────────────── */
  ngAfterViewInit(): void {
    if (this.reducedMotion) {
      this.applyStaticFallback();
      return;
    }
    ScrollTrigger.refresh();
    requestAnimationFrame(() => {
      this.runEntranceAnimation();
      this.initGoogleButton();
    });
  }

  private runEntranceAnimation(): void {
    this.gsapTl?.kill();

    gsap.set('#orbRed', { opacity: 0, scale: 0.8 });
    gsap.set('#orbTeal', { opacity: 0, scale: 0.8 });
    gsap.set('#notifW1', { x: -64, opacity: 0 });
    gsap.set('#notifW2', { x: 64, opacity: 0 });

    const formEls = Array.from(
      document.querySelectorAll<HTMLElement>('.entrance-hidden'),
    );

    gsap.set(formEls, { opacity: 0, y: 20 });

    this.gsapTl = gsap
      .timeline({
        defaults: { ease: 'power3.out' },
        onComplete: () => {
          this.entranceDone = true;
          formEls.forEach((el) => {
            el.classList.remove('entrance-hidden');
            gsap.set(el, { clearProps: 'opacity,transform,filter' });
          });
        },
      })

      .to(
        '#orbRed',
        { opacity: 0.3, scale: 1, duration: 1.1, ease: 'power2.out' },
        0,
      )
      .to(
        '#orbTeal',
        { opacity: 0.2, scale: 1, duration: 1.1, ease: 'power2.out' },
        0.1,
      )

      .fromTo(
        '#gsapLogo',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' },
        0.2,
      )

      .fromTo(
        '#gsapHl1',
        { opacity: 0, y: 32, skewY: 1.5 },
        { opacity: 1, y: 0, skewY: 0, duration: 0.65, ease: 'power3.out' },
        '>-0.1',
      )
      .fromTo(
        '#gsapHl2',
        { opacity: 0, y: 40, skewY: 2 },
        { opacity: 1, y: 0, skewY: 0, duration: 0.7, ease: 'expo.out' },
        '<0.28',
      )

      .fromTo(
        ['#gsapStat1', '#gsapStat2', '#gsapStat3'],
        { opacity: 0, y: 18, filter: 'blur(4px)' },
        {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 0.45,
          stagger: 0.1,
          ease: 'power2.out',
          onComplete: () => {
            document
              .querySelectorAll<HTMLElement>('.stat-dot')
              .forEach((dot) => dot.classList.add('stat-dot--animated'));
          },
        },
        '>-0.05',
      )

      .fromTo(
        '#notifW1',
        { x: -64, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.7,
          ease: 'power2.out',
          onComplete: () => {
            const card = document.querySelector<HTMLElement>('.notif-card--1');
            if (card) card.style.animationPlayState = 'running';
          },
        },
        0.6,
      )
      .fromTo(
        '#notifW2',
        { x: 64, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.7,
          ease: 'power2.out',
          onComplete: () => {
            const card = document.querySelector<HTMLElement>('.notif-card--2');
            if (card) card.style.animationPlayState = 'running';
          },
        },
        0.76,
      )

      .fromTo(
        formEls,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.07, ease: 'power2.out' },
        0.22,
      );
  }

  ngOnDestroy(): void {
    this.gsapTl?.kill();

    const staticSelectors = [
      '#orbRed',
      '#orbTeal',
      '#notifW1',
      '#notifW2',
      '#gsapLogo',
      '#gsapHl1',
      '#gsapHl2',
      '#gsapStat1',
      '#gsapStat2',
      '#gsapStat3',
      '#errorBanner',
      '.stat-dot',
      '.notif-card--1',
      '.notif-card--2',
    ];

    staticSelectors.forEach((sel) => {
      document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        gsap.killTweensOf(el);
        gsap.set(el, { clearProps: 'all' });
      });
    });

    document.querySelectorAll<HTMLElement>('.entrance-hidden').forEach((el) => {
      gsap.killTweensOf(el);
      gsap.set(el, { clearProps: 'all' });
    });
  }

  private applyStaticFallback(): void {
    const leftFallback: Record<string, Partial<CSSStyleDeclaration>> = {
      orbRed: { opacity: '0.3', transform: 'none' },
      orbTeal: { opacity: '0.2', transform: 'none' },
      notifW1: { opacity: '1', transform: 'none' },
      notifW2: { opacity: '1', transform: 'none' },
    };
    Object.entries(leftFallback).forEach(([id, styles]) => {
      const el = document.getElementById(id);
      if (el) Object.assign(el.style, styles);
    });
    document.querySelectorAll<HTMLElement>('.entrance-hidden').forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    (['notif-card--1', 'notif-card--2'] as const).forEach((cls) => {
      const card = document.querySelector<HTMLElement>(`.${cls}`);
      if (card) card.style.animationPlayState = 'running';
    });

    this.initGoogleButton();
  }
}
