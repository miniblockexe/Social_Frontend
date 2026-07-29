import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { firstValueFrom } from 'rxjs';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = auth.getToken();

  if (!token) {
    router.navigate(['/auth/login']);
    return false;
  }

  if (!auth.isTokenExpired()) {
    if (!auth.currentUser()) {
      try {
        await auth.loadCurrentUser();
      } catch {}
    }
    return true;
  }

  try {
    await firstValueFrom(auth.refreshToken());
    if (!auth.currentUser()) {
      await auth.loadCurrentUser();
    }
    return true;
  } catch {
    router.navigate(['/auth/login']);
    return false;
  }
};
