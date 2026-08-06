import type { ApiHandler } from '../lib/http.js';
import type { SetOrgRaceSettingsRequest, SetOrgRaceSettingsResponse, RaceSettings } from '@token-derby/shared';
import { ORG_NAME_PATTERN, parseSemver, validateStaminaConfig } from '@token-derby/shared';
import { getOrganisationByName } from '../db/organisations.js';
import { putRaceSettings } from '../db/race-settings.js';
import { ok, err, parseJson } from '../lib/http.js';
import { readCliVersion, meetsMinimumCliVersion, versionMismatchMessage } from '../lib/version.js';
import { resolveCaller } from '../lib/auth.js';

export const handler: ApiHandler = async (event) => {
  const auth = await resolveCaller(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  if (auth.source === 'cli') {
    const cli_version = readCliVersion(event);
    if (!cli_version) return err('BAD_REQUEST', 'X-Cli-Version header required — upgrade your CLI');
    if (!parseSemver(cli_version)) return err('BAD_REQUEST', `X-Cli-Version must be MAJOR.MINOR.PATCH (got "${cli_version}")`);
    if (!meetsMinimumCliVersion(cli_version)) return err('VERSION_MISMATCH', versionMismatchMessage());
  }

  const raw = event.pathParameters?.org_name;
  if (!raw) return err('BAD_REQUEST', 'org_name path parameter required');
  const org_name = decodeURIComponent(raw);
  if (!ORG_NAME_PATTERN.test(org_name)) return err('BAD_REQUEST', 'Invalid organisation name');

  const body = parseJson<SetOrgRaceSettingsRequest>(event.body);
  if (!body) return err('BAD_REQUEST', 'JSON body required');

  const org = await getOrganisationByName(org_name);
  if (!org) return err('ORG_NOT_FOUND', `No organisation named "${org_name}"`);
  if (org.creator_user_id !== auth.user_id) {
    return err('NOT_ORG_OWNER', 'Only the organisation creator can manage race settings');
  }

  if (
    body.stamina_config !== undefined &&
    (typeof body.stamina_config !== 'object' || body.stamina_config === null || Array.isArray(body.stamina_config))
  ) {
    return err('BAD_REQUEST', 'stamina_config must be an object');
  }

  const check = validateStaminaConfig(body.stamina_config ?? {});
  if (!check.ok) return err('BAD_REQUEST', check.message);

  const settings: RaceSettings = {
    org_id: org.org_id,
    ...(Object.keys(check.value).length > 0 ? { stamina_config: check.value } : {}),
    updated_at: new Date().toISOString(),
    updated_by_user_id: auth.user_id,
  };
  await putRaceSettings(settings);
  return ok({ settings } satisfies SetOrgRaceSettingsResponse);
};
