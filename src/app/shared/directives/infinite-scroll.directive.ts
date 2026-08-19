import {
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  inject,
} from '@angular/core';

/**
 * InfiniteScrollDirective
 *
 * Gắn lên một phần tử "sentinel" (thường là div trống ở cuối danh sách).
 * Khi sentinel vào viewport (threshold đạt ngưỡng), emit (scrolled).
 *
 * Dùng:
 *   <div appInfiniteScroll [disabled]="!hasMore || isLoading" (scrolled)="loadMore()"></div>
 */
@Directive({
  selector: '[appInfiniteScroll]',
  standalone: true,
})
export class InfiniteScrollDirective implements OnInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);

  /** Tắt trigger khi đang loading hoặc không còn data */
  @Input() disabled = false;

  /** Khoảng cách trước khi chạm đáy bắt đầu trigger (px) — mặc định 200px */
  @Input() threshold = 200;

  /** Emit khi sentinel vào viewport */
  @Output() scrolled = new EventEmitter<void>();

  private observer?: IntersectionObserver;

  ngOnInit(): void {
    // Dùng rootMargin để trigger sớm hơn khi còn cách đáy `threshold` px
    this.observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !this.disabled) {
          this.scrolled.emit();
        }
      },
      {
        rootMargin: `0px 0px ${this.threshold}px 0px`,
        threshold: 0,
      },
    );
    this.observer.observe(this.el.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
