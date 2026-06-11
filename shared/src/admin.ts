import type { StableHorse } from './types.js';

export type AdminLoginRequest = {
  username: string;
  password: string;
};

export type AdminLoginResponse = {
  token: string;
  expires_at: string; // ISO timestamp
};

export type AdminUser = {
  user_id: string;
  display_name: string;
  created_at: string;
  horses: StableHorse[];
};

export type AdminUsersResponse = {
  users: AdminUser[];
};

// Like OrganisationMember but without org_id — redundant when nested inside AdminOrg.
export type AdminOrgMember = {
  user_id: string;
  user_name: string;
  joined_at: string;
};

export type AdminOrg = {
  org_id: string;
  org_name: string;
  created_at: string;
  creator_user_id: string;
  creator_user_name: string;
  members: AdminOrgMember[];
};

export type AdminOrgsResponse = {
  organisations: AdminOrg[];
};
