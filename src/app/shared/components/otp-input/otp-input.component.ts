import {
  Component,
  EventEmitter,
  Output,
  ViewChildren,
  QueryList,
  ElementRef,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-otp-input',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './otp-input.component.html',
  styleUrl: './otp-input.component.scss',
})
export class OtpInputComponent {
  @Output() otpChange = new EventEmitter<string>();
  @ViewChildren('otpBox') boxes!: QueryList<ElementRef<HTMLInputElement>>;

  digits = signal<string[]>(['', '', '', '', '', '']);

  private emit(): void {
    this.otpChange.emit(this.digits().join(''));
  }

  onInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const val = input.value.replace(/\D/g, '');

    if (val.length > 1) {
      const chars = val.slice(0, 6).split('');
      const arr = [...this.digits()];
      chars.forEach((c, i) => {
        if (index + i < 6) arr[index + i] = c;
      });
      this.digits.set(arr);
      this.emit();
      const last = Math.min(index + chars.length, 5);
      setTimeout(() => this.focusBox(last));
      return;
    }

    const arr = [...this.digits()];
    arr[index] = val.slice(-1);
    this.digits.set(arr);
    this.emit();

    if (val && index < 5) {
      setTimeout(() => this.focusBox(index + 1));
    }
  }

  onKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Backspace') {
      const arr = [...this.digits()];
      if (arr[index]) {
        arr[index] = '';
        this.digits.set(arr);
        this.emit();
      } else if (index > 0) {
        arr[index - 1] = '';
        this.digits.set(arr);
        this.emit();
        setTimeout(() => this.focusBox(index - 1));
      }
      event.preventDefault();
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      this.focusBox(index - 1);
      event.preventDefault();
    }
    if (event.key === 'ArrowRight' && index < 5) {
      this.focusBox(index + 1);
      event.preventDefault();
    }
  }

  onPaste(event: ClipboardEvent, index: number): void {
    event.preventDefault();
    const text = event.clipboardData?.getData('text') ?? '';
    const nums = text.replace(/\D/g, '').slice(0, 6);
    if (!nums) return;

    const arr = [...this.digits()];
    nums.split('').forEach((c, i) => {
      if (index + i < 6) arr[index + i] = c;
    });
    this.digits.set(arr);
    this.emit();

    const last = Math.min(index + nums.length, 5);
    setTimeout(() => this.focusBox(last));
  }

  onFocus(index: number): void {
    setTimeout(() => this.boxes.toArray()[index]?.nativeElement.select());
  }

  private focusBox(index: number): void {
    this.boxes.toArray()[index]?.nativeElement.focus();
  }

  reset(): void {
    this.digits.set(['', '', '', '', '', '']);
    this.emit();
    setTimeout(() => this.focusBox(0));
  }
}
