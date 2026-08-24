import {
  Component,
  inject,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SwUpdateService } from '../../../core/services/sw-update.service';
import { gsap } from 'gsap';

@Component({
  selector: 'app-update-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './update-banner.component.html',
  styleUrl: './update-banner.component.scss',
})
export class UpdateBannerComponent implements AfterViewInit, OnDestroy {
  readonly swUpdateService = inject(SwUpdateService);

  @ViewChild('overlayRef') overlayRef!: ElementRef<HTMLElement>;
  @ViewChild('bannerRef') bannerRef!: ElementRef<HTMLElement>;

  private ctx!: gsap.Context;
  private overlayTl?: gsap.core.Timeline;
  private bannerTl?: gsap.core.Timeline;

  constructor() {
    effect(() => {
      const isUpdating = this.swUpdateService.isUpdating();
      if (isUpdating) {
        setTimeout(() => this.animateOverlayIn(), 0);
      }
    });

    effect(() => {
      const hasUpdate = this.swUpdateService.hasUpdate();
      if (hasUpdate) {
        setTimeout(() => this.animateBannerIn(), 0);
      }
    });
  }

  ngAfterViewInit(): void {
    this.ctx = gsap.context(() => {});
  }

  private animateOverlayIn(): void {
    const el = document.querySelector('.update-overlay') as HTMLElement;
    if (!el) return;

    this.overlayTl?.kill();

    const mm = gsap.matchMedia();
    mm.add({ reduceMotion: '(prefers-reduced-motion: reduce)' }, (ctx) => {
      const { reduceMotion } = (ctx as any).conditions;

      // Overlay fade-in
      gsap.fromTo(
        el,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: reduceMotion ? 0 : 0.25, ease: 'power2.out' },
      );

      if (reduceMotion) return;

      // Card scale-in
      const card = el.querySelector('.update-overlay__card') as HTMLElement;
      gsap.fromTo(
        card,
        { scale: 0.88, y: 16, autoAlpha: 0 },
        {
          scale: 1,
          y: 0,
          autoAlpha: 1,
          duration: 0.45,
          ease: 'back.out(1.6)',
          delay: 0.1,
        },
      );

      // Spinning arc
      const arc = el.querySelector('.update-overlay__arc') as SVGElement;
      this.overlayTl = gsap.timeline();
      this.overlayTl.to(arc, {
        rotation: 360,
        duration: 1.1,
        ease: 'none',
        repeat: -1,
        transformOrigin: '50% 50%',
      });

      // Icon pulse
      const icon = el.querySelector('.update-overlay__icon') as SVGElement;
      gsap.to(icon, {
        autoAlpha: 0.45,
        duration: 0.9,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
      });

      // Dots stagger blink
      const dots = el.querySelectorAll('.update-overlay__dots span');
      gsap.to(dots, {
        autoAlpha: 1,
        scale: 1.3,
        duration: 0.4,
        ease: 'sine.inOut',
        stagger: { each: 0.2, repeat: -1, yoyo: true },
      });
    });
  }

  private animateBannerIn(): void {
    const el = document.querySelector('.update-banner') as HTMLElement;
    if (!el) return;

    this.bannerTl?.kill();

    const mm = gsap.matchMedia();
    mm.add(
      {
        isMobile: '(max-width: 400px)',
        reduceMotion: '(prefers-reduced-motion: reduce)',
      },
      (ctx) => {
        const { isMobile, reduceMotion } = (ctx as any).conditions;

        if (reduceMotion) {
          gsap.set(el, { autoAlpha: 1 });
          return;
        }

        // Slide up from bottom
        const fromY = isMobile ? 40 : 28;
        gsap.fromTo(
          el,
          { autoAlpha: 0, y: fromY, scale: 0.94 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.55,
            ease: 'back.out(1.5)',
          },
        );

        // Glow pulse
        const glow = el.querySelector('.update-banner__glow') as HTMLElement;
        if (glow) {
          gsap.to(glow, {
            autoAlpha: 0.4,
            duration: 1.25,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
          });
        }

        // Badge pop-in
        const badge = el.querySelector('.update-banner__badge') as HTMLElement;
        gsap.fromTo(
          badge,
          { scale: 0.6, autoAlpha: 0 },
          {
            scale: 1,
            autoAlpha: 1,
            duration: 0.4,
            ease: 'back.out(2)',
            delay: 0.25,
          },
        );

        // Text slide in
        const texts = el.querySelectorAll(
          '.update-banner__title, .update-banner__sub',
        );
        gsap.fromTo(
          texts,
          { x: -12, autoAlpha: 0 },
          {
            x: 0,
            autoAlpha: 1,
            duration: 0.35,
            ease: 'power2.out',
            stagger: 0.08,
            delay: 0.3,
          },
        );

        // Actions slide in
        const actions = el.querySelector(
          '.update-banner__actions',
        ) as HTMLElement;
        gsap.fromTo(
          actions,
          { x: 12, autoAlpha: 0 },
          {
            x: 0,
            autoAlpha: 1,
            duration: 0.35,
            ease: 'power2.out',
            delay: 0.38,
          },
        );
      },
    );
  }

  ngOnDestroy(): void {
    this.overlayTl?.kill();
    this.bannerTl?.kill();
    this.ctx?.revert();
  }
}
