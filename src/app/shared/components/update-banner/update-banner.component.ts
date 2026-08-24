import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SwUpdateService } from '../../../core/services/sw-update.service';

@Component({
  selector: 'app-update-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './update-banner.component.html',
  styleUrl: './update-banner.component.scss',
})
export class UpdateBannerComponent {
  readonly swUpdateService = inject(SwUpdateService);
}
 