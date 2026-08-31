import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { gsapCleanupGuard } from './core/guards/gsap-cleanup.guard';
import { loginGuard } from './core/guards/login.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/landing/landing.component').then(
        (m) => m.LandingComponent,
      ),
    canDeactivate: [gsapCleanupGuard],
  },
  {
    path: 'auth/login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then(
        (m) => m.LoginComponent,
      ),
    canActivate: [loginGuard],
  },
  {
    path: 'auth/register',
    loadComponent: () =>
      import('./features/auth/register/register.component').then(
        (m) => m.RegisterComponent,
      ),
    canActivate: [loginGuard],
  },
  {
    path: 'auth/forgot-password',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.component').then(
        (m) => m.ForgotPasswordComponent,
      ),
  },
  {
    path: 'auth/reset-password',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password.component').then(
        (m) => m.ResetPasswordComponent,
      ),
  },
  {
    path: 'home',
    loadComponent: () =>
      import('./features/feed/feed.component').then((m) => m.FeedComponent),
    canActivate: [authGuard],
  },
  {
    path: 'profile/:id',
    loadComponent: () =>
      import('./features/profile/profile.component').then(
        (m) => m.ProfileComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'messages',
    loadComponent: () =>
      import('./features/messages/messages.component').then(
        (m) => m.MessagesComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'messages/:id',
    loadComponent: () =>
      import('./features/messages/messages.component').then(
        (m) => m.MessagesComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'posts/:id',
    loadComponent: () =>
      import('./features/post-detail/post-detail.component').then(
        (m) => m.PostDetailComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'notifications',
    loadComponent: () =>
      import('./features/notifications/notifications.component').then(
        (m) => m.NotificationsComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings.component').then(
        (m) => m.SettingsComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./features/admin/admin.component').then((m) => m.AdminComponent),
    canActivate: [authGuard, roleGuard],
  },
  {
    path: 'groups',
    loadComponent: () =>
      import('./features/groups/groups.component').then(
        (m) => m.GroupsComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'groups/:id',
    loadComponent: () =>
      import('./features/groups/group-detail/group-detail.component').then(
        (m) => m.GroupDetailComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'friends',
    loadComponent: () =>
      import('./features/friends/friends.component').then(
        (m) => m.FriendsComponent,
      ),
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: 'home' },
];
