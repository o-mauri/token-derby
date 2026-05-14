export type ErrorCode =
  | 'RACE_NOT_FOUND'
  | 'RACE_FULL'
  | 'RACE_FINISHED'
  | 'INVALID_TOKEN'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'VERSION_MISMATCH';

export type ErrorEnvelope = {
  code: ErrorCode;
  message: string;
};

export const ERROR_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  INVALID_TOKEN: 401,
  RACE_NOT_FOUND: 404,
  RACE_FULL: 409,
  RACE_FINISHED: 410,
  VERSION_MISMATCH: 426,
  RATE_LIMITED: 429,
};
