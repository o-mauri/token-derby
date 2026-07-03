export type WebSessionCreateResponse = {
  code: string;
};

export type WebSessionExchangeRequest = {
  code: string;
};

export type WebSessionExchangeResponse = {
  token: string;
  expires_at: string;
  user: { user_id: string; display_name: string };
};
