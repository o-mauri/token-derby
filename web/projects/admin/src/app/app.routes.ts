import { Routes } from '@angular/router';
import { adminGuard, signedOutGuard } from './session/admin-auth';

export const routes: Routes = [
  { path: 'login', canActivate: [signedOutGuard], loadComponent: () => import('./login/login.page').then((m) => m.LoginPage) },
  {
    path: '',
    canActivate: [adminGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'users' },
      { path: 'users', loadComponent: () => import('./placeholder').then((m) => m.Placeholder) },
      { path: 'users/:id', loadComponent: () => import('./placeholder').then((m) => m.Placeholder) },
    ],
  },
];
