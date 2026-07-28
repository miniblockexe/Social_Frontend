import { CanDeactivateFn } from '@angular/router';
import { LandingComponent } from '../../features/landing/landing.component';

export const gsapCleanupGuard: CanDeactivateFn<LandingComponent> = (
  component,
) => {
  component.cleanupGSAP();
  return true;
};