import { Component, signal, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-dialog.component.html',
})
export class ConfirmDialogComponent {
  title       = input<string>('Xác nhận');
  message     = input<string>('Bạn có chắc chắn không?');
  confirmText = input<string>('Xác nhận');
  cancelText  = input<string>('Hủy');
  danger      = input<boolean>(false);

  confirmed = output<void>();
  cancelled = output<void>();

  isVisible = signal(false);

  show(): void {
    this.isVisible.set(true);
  }

  hide(): void {
    this.isVisible.set(false);
  }

  onConfirm(): void {
    this.confirmed.emit();
    this.hide();
  }

  onCancel(): void {
    this.cancelled.emit();
    this.hide();
  }
}