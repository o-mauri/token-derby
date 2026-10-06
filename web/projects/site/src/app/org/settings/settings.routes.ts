import type { Routes } from '@angular/router';
import { unsavedChangesGuard } from './drafts';

/** The settings shell and its tabs; each tab asks before leaving unsaved changes. */
export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./settings.shell').then((m) => m.SettingsShell),
    children: [
      { path: '', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./members.tab').then((m) => m.MembersTab) },
      { path: 'access', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./access.tab').then((m) => m.AccessTab) },
      { path: 'racing', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./racing.tab').then((m) => m.RacingTab) },
      { path: 'race-settings', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./race-settings.tab').then((m) => m.RaceSettingsTab) },
      { path: 'notifications', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./notifications.tab').then((m) => m.NotificationsTab) },
    ],
  },
];
