import { Routes } from '@angular/router';
import { adminGuard, signedOutGuard } from './session/admin-auth';

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
      { path: 'organisations', data: { section: 'Organisations' }, loadComponent: () => import('./orgs/organisations.page').then((m) => m.OrganisationsPage) },
      { path: 'claims', data: { section: 'Claims' }, loadComponent: () => import('./claims/claims.page').then((m) => m.ClaimsPage) },
      { path: '**', loadComponent: () => import('./shell/not-found.page').then((m) => m.NotFoundPage) },
    ],
  },
];
