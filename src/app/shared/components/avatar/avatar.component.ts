import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-avatar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './avatar.component.html',
})
export class AvatarComponent {
  src = input<string | null | undefined>(null);
  name = input<string>('');
  size = input<number>(40);
  online = input<boolean>(false);

  avatarUrl = computed(
    () =>
      this.src() ??
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${this.name()}`,
  );
  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${this.name()}`;
  }
}
