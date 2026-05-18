export type ErrorCode = 'RACE_NOT_FOUND' | 'RACE_FULL' | 'RACE_FINISHED' | 'INVALID_TOKEN' | 'RATE_LIMITED' | 'BAD_REQUEST' | 'VERSION_MISMATCH' | 'IDENTITY_REQUIRED' | 'DUPLICATE_HORSE' | 'ORG_NAME_TAKEN' | 'ORG_NOT_FOUND' | 'NOT_ORG_MEMBER' | 'UNAUTHENTICATED' | 'STABLE_HORSE_NOT_FOUND' | 'STABLE_HORSE_NAME_TAKEN';
export type ErrorEnvelope = {
    code: ErrorCode;
    message: string;
};
export declare const ERROR_STATUS: Record<ErrorCode, number>;
