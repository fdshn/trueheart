import { ISeedContext, Personas } from './seed-context';

/**
 * Link giới thiệu (deferred attribution, 01/11): một link của người tặng demo trỏ vào hồ sơ
 * của họ, một lượt mở, một lượt resolve, và một claim ĐANG CHỜ DUYỆT của người mới — để CMS
 * thử ngay hàng đợi `GET /admin/attribution/claims?riskStatus=PENDING_REVIEW`.
 *
 * Claim chờ duyệt chứ không `QUALIFIED`: claim qua kiểm thì ghi `referrals`, mà người mới đã
 * có thể có người giới thiệu từ phần seed người dùng — hai dòng sẽ đụng nhau.
 *
 * Token không seed được (cần khoá ký của môi trường) — dòng ở đây chỉ để đọc.
 */
export async function seedAttribution(ctx: ISeedContext): Promise<void> {
  const [schema] = await ctx.q<{ ready: boolean }>(
    `SELECT to_regclass('public.attribution_links') IS NOT NULL AS ready`,
  );
  if (!schema?.ready) return;

  const [seeded] = await ctx.q(
    `SELECT 1 FROM attribution_links WHERE code = 'SEEDDEMO01'`,
  );
  if (seeded) return;

  const [link] = await ctx.q<{ id: string }>(
    `
      INSERT INTO attribution_links
        (code, referrer_id, target_type, target_value, campaign, source, medium)
      SELECT 'SEEDDEMO01', global_id, 'PROFILE', username, 'demo', 'zalo', 'share'
      FROM users WHERE global_id = $1
      RETURNING id::text AS id
    `,
    [Personas.giver],
  );
  if (!link) return;

  const clickId = '5eed2500-0000-4000-8000-000000000001';
  await ctx.q(
    `
      INSERT INTO attribution_clicks
        (global_id, link_id, token_jti, issued_at, expires_at, ip_hash, user_agent_hash)
      VALUES ($1, $2, '5eed2500-0000-4000-8000-000000000002', now() - interval '2 days',
              now() + interval '12 days', NULL, NULL)
    `,
    [clickId, link.id],
  );
  const [resolution] = await ctx.q<{ id: string }>(
    `
      INSERT INTO attribution_resolutions
        (click_id, install_id_hash, platform, claim_jti, claim_expires_at, resolved_at, last_resolved_at)
      VALUES ($1, 'seed-install-hash', 'ANDROID', '5eed2500-0000-4000-8000-000000000003',
              now() - interval '1 day', now() - interval '2 days', now() - interval '2 days')
      RETURNING id::text AS id
    `,
    [clickId],
  );
  await ctx.q(
    `
      INSERT INTO attribution_claims
        (global_id, click_id, resolution_id, claim_jti, referrer_id, referred_user_id,
         risk_status, risk_reason, claimed_at)
      VALUES ('5eed2500-0000-4000-8000-000000000004', $1, $2,
              '5eed2500-0000-4000-8000-000000000003', $3, $4,
              'PENDING_REVIEW', 'INSTALL_REUSED', now() - interval '2 days')
      ON CONFLICT DO NOTHING
    `,
    [clickId, resolution.id, Personas.giver, Personas.newcomer],
  );
  await ctx.q(
    `
      INSERT INTO attribution_audit_events (event, outcome, click_id, user_id, created_at)
      VALUES ('CLICK', 'ISSUED', $1, NULL, now() - interval '2 days'),
             ('RESOLVE', 'MATCHED', $1, NULL, now() - interval '2 days'),
             ('CLAIM', 'CLAIMED_PENDING_REVIEW', $1, $2, now() - interval '2 days')
    `,
    [clickId, Personas.newcomer],
  );
}
