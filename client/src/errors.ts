export type ApiErrorCode =
  | 'RACE_NOT_FOUND'
  | 'RACE_FULL'
  | 'RACE_FINISHED'
  | 'INVALID_TOKEN'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'VERSION_MISMATCH'
  | 'IDENTITY_REQUIRED'
  | 'DUPLICATE_HORSE'
  | 'ORG_NAME_TAKEN'
  | 'ORG_NOT_FOUND'
  | 'NOT_ORG_MEMBER'
  | 'UNAUTHENTICATED'
  | 'STABLE_HORSE_NOT_FOUND'
  | 'STABLE_HORSE_NAME_TAKEN'
  | 'INSUFFICIENT_ROLLS'
  | 'NETWORK_ERROR';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
