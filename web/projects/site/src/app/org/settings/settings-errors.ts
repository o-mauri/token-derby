import { ApiError } from '@token-derby/ui';

/** The settings pages' error copy: the API's error codes as sentences, falling back to the server's own message. */
export function settingsErrorText(e: unknown, orgName: string): string {
  const code = e instanceof ApiError ? e.code : '';
  switch (code) {
    case 'NOT_ORG_OWNER': return `Only the owner of ${orgName} can change its settings.`;
    case 'CANNOT_REMOVE_OWNER': return "The owner can't be removed.";
    case 'DOMAIN_NOT_VERIFIED': return 'You can only add a domain your own Google email is on.';
    case 'DOMAIN_ALREADY_CLAIMED': return 'That domain already belongs to another organisation.';
    case 'ALLOW_LIST_REQUIRED': return 'Add at least one domain before requiring one.';
    case 'ACCESS_CONFLICT': return "Someone else changed these settings. They've been reloaded.";
    case 'LEAGUE_CONFLICT': return 'Turn off the current racing mode first.';
    case 'BAD_REQUEST': return (e as ApiError).message;
    default: return "Couldn't save. Try again.";
  }
}
