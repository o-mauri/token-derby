import type { ApiHandler } from '../lib/http.js';
import type { CreateClaimRequest, CreateClaimResponse } from '@token-derby/shared';
import {
  hatById,
  DEFAULT_CLAIM_EXPIRY_DAYS,
  MAX_CLAIM_EXPIRY_DAYS,
} from '@token-derby/shared';
import { requireAdmin } from '../lib/admin-auth.js';
import { loadAdminConfig } from '../lib/admin-config.js';
import { generateClaimCode } from '../lib/claim-code.js';
import { putClaim } from '../db/claims.js';
import { ok, err, parseJson } from '../lib/http.js';

export const handler: ApiHandler = async (event) => {
  const cfg = await loadAdminConfig();
  const auth = requireAdmin(event, cfg.sessionSecret);
  if (!auth.ok) return err('UNAUTHENTICATED', 'Admin session required');

  const body = parseJson<CreateClaimRequest>(event.body);
  if (!body) return err('BAD_REQUEST', 'JSON body required');
  if (body.item_type !== 'hat') return err('BAD_REQUEST', "item_type must be 'hat'");

  const hat = hatById(body.hat_id);
  if (!hat) return err('BAD_REQUEST', `Unknown hat_id: ${body.hat_id}`);

  // Legendaries are single-design; every other hat must name a variant so the
  // stored claim resolves to exactly one collectible.
  if (hat.rarity === 'legendary') {
    if (body.variant !== undefined) return err('BAD_REQUEST', 'Legendary hats have no variants');
  } else {
    if (!Number.isInteger(body.variant)) return err('BAD_REQUEST', 'variant is required');
    if (body.variant! < 0 || body.variant! >= hat.variants.length) {
      return err('BAD_REQUEST', `variant out of range (have ${hat.variants.length})`);
    }
  }

  const days = body.expires_in_days ?? DEFAULT_CLAIM_EXPIRY_DAYS;
  if (!Number.isInteger(days) || days < 1 || days > MAX_CLAIM_EXPIRY_DAYS) {
    return err('BAD_REQUEST', `expires_in_days must be an integer 1..${MAX_CLAIM_EXPIRY_DAYS}`);
  }

  const expires_at = new Date(Date.now() + days * 86_400_000).toISOString();
  const record = await putClaim({
    code: generateClaimCode(),
    item_type: 'hat',
    hat_id: body.hat_id,
    variant: hat.rarity === 'legendary' ? undefined : body.variant,
    expires_at,
    created_by: 'admin',
  });

  const response: CreateClaimResponse = {
    code: record.code,
    item_type: record.item_type,
    hat_id: record.hat_id,
    expires_at: record.expires_at,
  };
  if (record.variant !== undefined) response.variant = record.variant;
  return ok(response);
};
