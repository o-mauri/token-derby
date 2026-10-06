import { Routes } from '@angular/router';
import { adminGuard, signedOutGuard } from './session/admin-auth';

const placeholder = () => import('./placeholder').then((m) => m.Placeholder);

export const routes: Routes = [
  { path: 'login', canActivate: [signedOutGuard], loadComponent: () => import('./login/login.page').then((m) => m.LoginPage) },
  {
    path: '',
    canActivate: [adminGuard],
    loadComponent: () => import('./shell/admin.shell').then((m) => m.AdminShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'users' },
      { path: 'users', data: { section: 'Users' }, loadComponent: () => import('./users/users.page').then((m) => m.UsersPage) },
      { path: 'users/:id', data: { section: 'Users' }, loadComponent: () => import('./users/user.page').then((m) => m.UserPage) },
      { path: 'organisations', data: { section: 'Organisations' }, loadComponent: placeholder },
      { path: 'claims', data: { section: 'Claims' }, loadComponent: placeholder },
      { path: '**', loadComponent: placeholder },
    ],
  },
];
