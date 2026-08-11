import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  activeStep = 1;

  readonly steps = [
    {
      id: 1,
      title: 'Tạo tài khoản',
      desc: 'Đăng ký miễn phí trong vài giây. Không cần thẻ tín dụng.',
    },
    {
      id: 2,
      title: 'Kết nối bạn bè',
      desc: 'Tìm và kết bạn với người quen qua gợi ý thông minh.',
    },
    {
      id: 3,
      title: 'Chia sẻ khoảnh khắc',
      desc: 'Đăng ảnh, video và câu chuyện của riêng bạn.',
    },
  ];

  readonly testimonials = [
    {
      id: 1,
      text: 'SocialApp giúp tôi kết nối với bạn bè nhanh hơn bao giờ hết. Chat mượt, feed không rác.',
      name: 'Nguyễn Văn An',
      role: 'Sinh viên, Hà Nội',
      initials: 'A',
      avatarBg: 'linear-gradient(135deg, #ff4d3d, #f5a623)',
    },
    {
      id: 2,
      text: 'Giao diện tối đẹp, tính năng story hoạt động rất tốt. Tôi thích nhất là feed không có quảng cáo phiền phức.',
      name: 'Trần Thị Bích',
      role: 'Designer, Hà Nội',
      initials: 'B',
      avatarBg: 'linear-gradient(135deg, #ec4899, #a855f7)',
    },
    {
      id: 3,
      text: 'Là developer, tôi ấn tượng với độ ổn định và tốc độ. WebSocket hoạt động cực kỳ mượt, không bao giờ ngắt kết nối giữa chừng.',
      name: 'Đinh Lê Viết Cường',
      role: 'Developer, Đà Lạt',
      initials: 'C',
      avatarBg: 'linear-gradient(135deg, #00d4a8, #0099ff)',
    },
  ];

  private gsapReady = false;

  private gsapRef: any = null;
  private scrollTriggerRef: any = null;

  setActiveStep(id: number): void {
    this.activeStep = id;
  }

  ngOnInit(): void {
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/home']);
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.initGSAP(), 50);
  }

  private async initGSAP(): Promise<void> {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    try {
      const { gsap } = await import('gsap');
      const { ScrollTrigger } = await import('gsap/ScrollTrigger');
      gsap.registerPlugin(ScrollTrigger);

      // Lưu reference ngay sau khi load xong
      this.gsapRef = gsap;
      this.scrollTriggerRef = ScrollTrigger;

      // Thêm gsap-ready TRƯỚC khi gọi bất kỳ gsap.from() nào
      document.querySelector('.sp-landing-page')?.classList.add('gsap-ready');
      this.gsapReady = true;

      const q = (sel: string): Element | null => document.querySelector(sel);
      const qAll = (sel: string): NodeListOf<Element> =>
        document.querySelectorAll(sel);

      // Nav scroll effect
      try {
        const navbar = q('.sp-landing-nav') as HTMLElement | null;
        if (navbar) {
          ScrollTrigger.create({
            start: 'top -80',
            onEnter: () => navbar.classList.add('scrolled'),
            onLeaveBack: () => navbar.classList.remove('scrolled'),
          });
        }
      } catch (e) {
        console.warn('[Landing] Navbar ScrollTrigger skipped:', e);
      }

      // Nav entrance
      if (q('.sp-landing-nav')) {
        gsap.from('.sp-landing-nav', {
          y: -60,
          opacity: 0,
          duration: 0.6,
          ease: 'power3.out',
          clearProps: 'all',
        });
      }

      // Hero copy
      if (q('.gs-hero-copy')) {
        gsap.from('.gs-hero-copy', {
          y: 50,
          opacity: 0,
          duration: 0.85,
          ease: 'power3.out',
          delay: 0.15,
          clearProps: 'all',
        });
      }

      // Hero visual
      if (q('.gs-hero-visual')) {
        gsap.from('.gs-hero-visual', {
          x: 60,
          opacity: 0,
          duration: 0.9,
          ease: 'power3.out',
          delay: 0.25,
          clearProps: 'transform',
        });
      }

      // Floating cards pop in
      if (q('.gs-notif-pop')) {
        gsap.from('.gs-notif-pop', {
          scale: 0.8,
          opacity: 0,
          duration: 0.5,
          delay: 0.8,
          ease: 'back.out(1.7)',
          clearProps: 'all',
        });
      }

      if (q('.gs-online-pop')) {
        gsap.from('.gs-online-pop', {
          scale: 0.8,
          opacity: 0,
          duration: 0.5,
          delay: 1.0,
          ease: 'back.out(1.7)',
          clearProps: 'all',
        });
      }

      // Section headers (scroll-driven)
      if (qAll('.gs-section-header').length > 0) {
        try {
          gsap.from('.gs-section-header', {
            scrollTrigger: {
              trigger: '.gs-section-header',
              start: 'top 85%',
            },
            y: 30,
            opacity: 0,
            duration: 0.5,
            stagger: 0.15,
            ease: 'power2.out',
            clearProps: 'all',
          });
        } catch (e) {
          console.warn('[Landing] Section header animation skipped:', e);
        }
      }

      // Feature cards
      if (qAll('.gs-feature-card').length > 0) {
        try {
          gsap.from('.gs-feature-card', {
            scrollTrigger: {
              trigger: '.sp-landing-features',
              start: 'top 80%',
            },
            y: 50,
            opacity: 0,
            duration: 0.6,
            stagger: 0.08,
            ease: 'power2.out',
            clearProps: 'all',
          });
        } catch (e) {
          console.warn('[Landing] Feature cards animation skipped:', e);
        }
      }

      // Steps
      if (qAll('.gs-step').length > 0) {
        try {
          gsap.from('.gs-step', {
            scrollTrigger: {
              trigger: '.sp-landing-steps',
              start: 'top 80%',
            },
            x: -40,
            opacity: 0,
            duration: 0.5,
            stagger: 0.18,
            ease: 'power2.out',
            clearProps: 'all',
          });
        } catch (e) {
          console.warn('[Landing] Steps animation skipped:', e);
        }
      }

      // Testimonials
      if (qAll('.gs-testimonial').length > 0) {
        try {
          gsap.from('.gs-testimonial', {
            scrollTrigger: {
              trigger: '.sp-landing-testimonials',
              start: 'top 80%',
            },
            y: 40,
            opacity: 0,
            duration: 0.5,
            stagger: 0.12,
            ease: 'power2.out',
            clearProps: 'all',
          });
        } catch (e) {
          console.warn('[Landing] Testimonials animation skipped:', e);
        }
      }

      // CTA banner
      if (q('.gs-cta-banner')) {
        try {
          gsap.from('.gs-cta-banner', {
            scrollTrigger: {
              trigger: '.gs-cta-banner',
              start: 'top 85%',
            },
            scale: 0.95,
            opacity: 0,
            duration: 0.7,
            ease: 'back.out(1.5)',
            clearProps: 'all',
          });
        } catch (e) {
          console.warn('[Landing] CTA banner animation skipped:', e);
        }
      }

      // SVG bento animations
      this.animateSVGAssets(gsap, ScrollTrigger);
    } catch (e) {
      document
        .querySelector('.sp-landing-page')
        ?.classList.remove('gsap-ready');
      this.gsapReady = false;
      this.gsapRef = null;
      this.scrollTriggerRef = null;
      console.warn(
        '[LandingComponent] GSAP load failed, static fallback active:',
        e,
      );
    }
  }

  private animateSVGAssets(gsap: any, ScrollTrigger: any): void {
    if (document.querySelector('#sp-bubble-main')) {
      gsap.from('#sp-bubble-main', {
        scrollTrigger: { trigger: '.sp-bento-chat', start: 'top 80%' },
        x: -16,
        y: 10,
        opacity: 0,
        scale: 0.88,
        transformOrigin: 'bottom left',
        duration: 0.65,
        ease: 'back.out(1.6)',
        clearProps: 'all',
      });

      gsap.from('#sp-bubble-sm', {
        scrollTrigger: { trigger: '.sp-bento-chat', start: 'top 78%' },
        x: 16,
        y: -10,
        opacity: 0,
        scale: 0.8,
        transformOrigin: 'top right',
        duration: 0.5,
        delay: 0.18,
        ease: 'back.out(1.8)',
        clearProps: 'all',
      });

      // Typing dots: entrance fade chỉ — bounce do CSS animation (4s, 3 bounce + nghỉ)
      gsap.from('#sp-typing-dots circle', {
        scrollTrigger: { trigger: '.sp-bento-chat', start: 'top 76%' },
        opacity: 0,
        y: 4,
        duration: 0.25,
        stagger: 0.1,
        delay: 0.4,
        ease: 'power2.out',
        clearProps: 'all',
      });
    }

    if (document.querySelector('#sp-shield-body')) {
      gsap.from('#sp-shield-body', {
        scrollTrigger: { trigger: '.sp-bento-privacy', start: 'top 80%' },
        scale: 0.5,
        opacity: 0,
        transformOrigin: 'center center',
        duration: 0.7,
        ease: 'back.out(1.5)',
        clearProps: 'all',
      });

      gsap.from('#sp-shield-lock', {
        scrollTrigger: { trigger: '.sp-bento-privacy', start: 'top 78%' },
        scale: 0,
        opacity: 0,
        transformOrigin: 'center center',
        duration: 0.45,
        delay: 0.3,
        ease: 'back.out(2.2)',
        clearProps: 'all',
      });

      ScrollTrigger.create({
        trigger: '.sp-bento-privacy',
        start: 'top 75%',
        onEnter: () => {
          gsap.to('.sp-bento-privacy .sp-bento-svg-wrap svg', {
            filter: 'drop-shadow(0 0 10px rgba(255,77,61,0.45))',
            duration: 1.8,
            yoyo: true,
            repeat: -1,
            ease: 'sine.inOut',
            delay: 0.5,
          });
        },
      });
    }

    if (document.querySelector('#sp-net-lines')) {
      gsap.from('#sp-net-lines > *', {
        scrollTrigger: { trigger: '.sp-bento-community', start: 'top 80%' },
        opacity: 0,
        duration: 0.6,
        stagger: 0.06,
        ease: 'power1.out',
        clearProps: 'opacity',
      });

      gsap.from('#sp-net-nodes .sp-node', {
        scrollTrigger: { trigger: '.sp-bento-community', start: 'top 78%' },
        scale: 0,
        opacity: 0,
        transformOrigin: 'center center',
        duration: 0.42,
        delay: 0.4,
        stagger: {
          amount: 0.55,
          from: 'random',
        },
        ease: 'back.out(2)',
        clearProps: 'all',
      });

      ScrollTrigger.create({
        trigger: '.sp-bento-community',
        start: 'top 75%',
        onEnter: () => {
          gsap.to('#sp-net-nodes .sp-node', {
            scale: 1.18,
            transformOrigin: 'center center',
            duration: 1.6,
            stagger: {
              amount: 1.8,
              from: 'random',
              repeat: -1,
            },
            yoyo: true,
            repeat: -1,
            ease: 'sine.inOut',
            delay: 1.2,
          });
        },
      });
    }
  }

  cleanupGSAP(): void {
    if (this.scrollTriggerRef) {
      this.scrollTriggerRef.getAll().forEach((t: any) => t.kill());
      this.scrollTriggerRef.clearScrollMemory();
      this.scrollTriggerRef = null;
    }
    if (this.gsapRef) {
      this.gsapRef.killTweensOf('*');
      this.gsapRef = null;
    }
    document.querySelector('.sp-landing-page')?.classList.remove('gsap-ready');
    this.gsapReady = false;
  }

  ngOnDestroy(): void {
    this.cleanupGSAP();
  }
}
