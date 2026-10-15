export type WebSessionCreateResponse = {
  code: string;
};

export type WebSessionExchangeRequest = {
  code: string;
};

export type WebSessionExchangeResponse = {
  token: string;
  expires_at: string;
  user: { user_id: string; display_name: string; email?: string };
};

/** DELETE /api/web-sessions/all: how many browser sign-ins were ended. */
export type WebSessionsDeleteAllResponse = {
  signed_out: number;
};

export type AuthLinkStartResponse = {
  authorize_url: string;
};
