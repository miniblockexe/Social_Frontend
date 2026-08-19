import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * SkeletonCardComponent
 *
 * Skeleton placeholder tái sử dụng — khớp với PostCardComponent layout.
 * Dùng cùng CSS vars (--c-surface, --c-surface2, shimmer) với feed hiện có.
 *
 * @Input variant  — 'post' (mặc định) | 'group' | 'member' | 'request'
 * @Input count    — số skeleton card render (mặc định 3)
 * @Input showImage — có render skeleton ảnh không (mặc định true cho 'post')
 */
@Component({
  selector: 'app-skeleton-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="sk-list"
      [class]="'sk-list--' + variant"
      aria-busy="true"
      aria-label="Đang tải..."
      role="status"
    >
      @for (i of items; track i) {
        @switch (variant) {

          @case ('post') {
            <div class="sk-card">
              <div class="sk-header">
                <div class="sk-avatar sk-pulse"></div>
                <div class="sk-lines">
                  <div class="sk-line sk-pulse" style="width:38%"></div>
                  <div class="sk-line sk-pulse" style="width:22%;margin-top:6px"></div>
                </div>
                <div class="sk-line sk-pulse" style="width:20px;margin-left:auto"></div>
              </div>
              <div class="sk-body">
                <div class="sk-line sk-pulse" style="width:100%"></div>
                <div class="sk-line sk-pulse" style="width:72%;margin-top:7px"></div>
                <div class="sk-line sk-pulse" style="width:48%;margin-top:7px"></div>
              </div>
              @if (showImage) {
                <div class="sk-image sk-pulse"></div>
              }
              <div class="sk-actions">
                <div class="sk-action-btn sk-pulse"></div>
                <div class="sk-action-btn sk-pulse"></div>
                <div class="sk-action-btn sk-pulse"></div>
              </div>
            </div>
          }

          @case ('group') {
            <div class="sk-group-card">
              <div class="sk-group-cover sk-pulse"></div>
              <div class="sk-group-body">
                <div class="sk-group-avatar sk-pulse"></div>
                <div class="sk-line sk-pulse" style="width:60%;margin-top:8px"></div>
                <div class="sk-line sk-pulse" style="width:40%;margin-top:6px"></div>
                <div class="sk-btn-full sk-pulse"></div>
              </div>
            </div>
          }

          @case ('member') {
            <div class="sk-member">
              <div class="sk-avatar sk-pulse"></div>
              <div class="sk-lines" style="flex:1">
                <div class="sk-line sk-pulse" style="width:45%"></div>
                <div class="sk-line sk-pulse" style="width:30%;margin-top:6px"></div>
              </div>
              <div class="sk-badge sk-pulse"></div>
            </div>
          }

          @case ('request') {
            <div class="sk-req">
              <div class="sk-avatar sk-pulse"></div>
              <div class="sk-lines" style="flex:1">
                <div class="sk-line sk-pulse" style="width:55%"></div>
                <div class="sk-btn-pair">
                  <div class="sk-btn-sm sk-pulse"></div>
                  <div class="sk-btn-sm sk-pulse"></div>
                </div>
              </div>
            </div>
          }

        }
      }
    </div>
  `,
  styleUrl: './skeleton-card.component.scss',
})
export class SkeletonCardComponent {
  @Input() variant: 'post' | 'group' | 'member' | 'request' = 'post';
  @Input() count = 3;
  @Input() showImage = true;

  get items(): number[] {
    return Array.from({ length: this.count }, (_, i) => i);
  }
}
