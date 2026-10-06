import type { HttpTestingController } from '@angular/common/http/testing';
import { ORGS, USERS } from './fixtures';

/** Answers the shell's two list loads (users first, so pages can hold the users request open). */
export function answerLists(http: HttpTestingController, users = USERS, orgs = ORGS): void {
  http.match('/api/admin/users').forEach((r) => r.flush({ users: structuredClone(users) }));
  http.match('/api/admin/organisations').forEach((r) => r.flush({ organisations: structuredClone(orgs) }));
}
