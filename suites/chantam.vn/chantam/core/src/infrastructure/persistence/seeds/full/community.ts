import { affiliateRewardIdempotencyKey } from '@chantam.vn/chantam.core-lib/models';
import { ISeedContext, Personas, SeedDomains, seedId } from './seed-context';

const group = (n: number) => seedId(SeedDomains.groups, n);
const subTeam = (n: number) => seedId(SeedDomains.subTeams, n);
const event = (n: number) => seedId(SeedDomains.affiliateEvents, n);

const SeedPolicyReason =
  'seed:full — lịch sử chính sách affiliate để test, bản hiện hành TẮT';

/** Nhóm thiện nguyện, đội con, thành viên, và lịch sử affiliate nhóm (F58). */
export async function seedCommunity(ctx: ISeedContext): Promise<void> {
  const groups: ReadonlyArray<
    [number, string, string, string, 'ACTIVE' | 'DISSOLVED']
  > = [
    [
      1,
      Personas.groupOwner,
      'Thiện nguyện Hà Đông',
      'SEEDHADONG234567',
      'ACTIVE',
    ],
    [
      2,
      Personas.giver2,
      'Nhóm cũ đã giải tán',
      'SEEDOLDGRP234567',
      'DISSOLVED',
    ],
  ];
  for (const [n, owner, name, code, status] of groups)
    await ctx.q(
      `
        INSERT INTO groups (
          global_id, owner_id, name, description, center_location, region_label,
          radius_km, invite_code, status, activated_at, dissolved_at
        )
        VALUES ($1, $2, $3, 'Nhóm demo cho các API nhóm, đội con và affiliate.',
                ST_SetSRID(ST_MakePoint(105.7781, 20.9745), 4326)::geography,
                'Hà Đông, Hà Nội', 5, $4, $5::groups_status_enum, now() - interval '60 days',
                CASE WHEN $5::groups_status_enum = 'DISSOLVED' THEN now() - interval '10 days' END)
        ON CONFLICT DO NOTHING
      `,
      [group(n), owner, name, code, status],
    );

  for (const [n, name] of [
    [1, 'Đội vận chuyển'],
    [2, 'Đội truyền thông'],
  ] as const)
    await ctx.q(
      `INSERT INTO sub_teams (global_id, group_id, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [subTeam(n), group(1), name],
    );

  // Mỗi người tối đa MỘT nhóm đang ACTIVE (UQ_group_memberships_one_active_per_user).
  const memberships: ReadonlyArray<
    [number, number, string, string, number | null, string]
  > = [
    [1, 1, Personas.groupOwner, 'OWNER', null, 'ACTIVE'],
    [2, 1, Personas.coordinator, 'SUBTEAM_ADMIN', 1, 'ACTIVE'],
    [3, 1, Personas.receiver, 'MEMBER', 1, 'ACTIVE'],
    [4, 1, Personas.giver, 'MEMBER', 2, 'ACTIVE'],
    [5, 2, Personas.giver2, 'OWNER', null, 'DISSOLVED'],
  ];
  for (const [n, groupN, userId, role, teamN, status] of memberships)
    await ctx.q(
      `
        INSERT INTO group_memberships (global_id, group_id, user_id, sub_team_id, role, status, joined_at)
        VALUES ($1, $2, $3, $4, $5::group_member_roles_enum,
                $6::group_membership_statuses_enum, now() - interval '50 days')
        ON CONFLICT DO NOTHING
      `,
      [
        seedId(SeedDomains.memberships, n),
        group(groupN),
        userId,
        teamN ? subTeam(teamN) : null,
        role,
        status,
      ],
    );

  await seedAffiliateHistory(ctx);
}

/**
 * Chỉ seed khi bảng chính sách CÒN TRỐNG hoặc đã là của seed.
 *
 * Sự kiện affiliate trỏ vào `policy_version`. Trên một database đã có chính sách thật,
 * gắn sự kiện giả vào version của người ta là làm bẩn lịch sử chính sách. Bản hiện hành
 * (v2) luôn TẮT: seed không được bật một tính năng mà Bên A chưa duyệt số.
 */
async function seedAffiliateHistory(ctx: ISeedContext): Promise<void> {
  const [state] = await ctx.q<{ total: number; ours: number }>(
    `
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE reason = $1)::int AS ours
      FROM affiliate_policy_revisions
    `,
    [SeedPolicyReason],
  );
  if (state.total > 0 && state.ours === 0) return;

  for (const [version, enabled, effective] of [
    [1, true, `now() - interval '40 days'`],
    [2, false, `now() - interval '1 day'`],
  ] as const)
    await ctx.q(
      `
        INSERT INTO affiliate_policy_revisions (
          version, enabled, distribution_mode, event_points_json,
          daily_cap_per_beneficiary, max_beneficiaries_per_event, effective_at, reason,
          created_by
        )
        VALUES ($1, $2, 'SPLIT_POOL', '{"POST_CREATED": 2, "GIFT_COMPLETED": 12}'::jsonb,
                20, 50, ${effective}, $3, $4)
        ON CONFLICT DO NOTHING
      `,
      [version, enabled, SeedPolicyReason, Personas.admin],
    );

  const giftDeal = seedId(SeedDomains.transactions, 3);
  const events: ReadonlyArray<
    [number, string, string, string, string, number, number]
  > = [
    // Trao quà trong bán kính: 12 điểm chia cho 3 thành viên.
    [1, 'GIFT_COMPLETED', 'GIFT_TRANSACTION', giftDeal, 'ELIGIBLE', 3, 12],
    // Bài đăng ngoài bán kính nhóm: ghi sự kiện, không phát điểm.
    [
      2,
      'POST_CREATED',
      'POST',
      seedId(SeedDomains.posts, 9),
      'NOT_ELIGIBLE_GEO',
      0,
      0,
    ],
  ];
  for (const [n, type, refType, refId, geo, beneficiaries, points] of events)
    await ctx.q(
      `
        INSERT INTO affiliate_events (
          global_id, group_id, source_user_id, event_type, reference_type, reference_id,
          geo_status, location_source, distance_meters, radius_meters, beneficiary_count,
          total_points, policy_version, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 5000, $10, $11, 1, now() - interval '5 days')
        ON CONFLICT DO NOTHING
      `,
      [
        event(n),
        group(1),
        Personas.giver,
        type,
        refType,
        refId,
        geo,
        geo === 'ELIGIBLE' ? 'TRANSACTION' : 'POST',
        geo === 'ELIGIBLE' ? 1200 : 7400,
        beneficiaries,
        points,
      ],
    );

  // Ba người nhận của sự kiện 1: hai được điểm, một chạm trần ngày.
  const rewards: ReadonlyArray<[string, 'AWARDED' | 'CAPPED', number]> = [
    [Personas.groupOwner, 'AWARDED', 4],
    [Personas.coordinator, 'AWARDED', 4],
    [Personas.receiver, 'CAPPED', 0],
  ];
  for (const [beneficiary, status, delta] of rewards) {
    const key = affiliateRewardIdempotencyKey({
      beneficiaryUserId: beneficiary,
      eventType: 'GIFT_COMPLETED',
      referenceType: 'GIFT_TRANSACTION',
      referenceId: giftDeal,
    });
    const ledgerId =
      status === 'AWARDED'
        ? (
            await ctx.ledger.appendAdjustment({
              userId: beneficiary,
              ruleCode: 'GROUP_AFFILIATE',
              delta,
              referenceType: 'GIFT_TRANSACTION',
              referenceId: giftDeal,
              idempotencyKey: key,
              actor: 'SYSTEM',
              source: 'GROUP_AFFILIATE',
              reason: 'Affiliate nhóm: GIFT_COMPLETED',
            })
          ).entryId
        : null;
    await ctx.q(
      `
        INSERT INTO affiliate_rewards (
          event_id, group_id, source_user_id, beneficiary_user_id, event_type,
          reference_type, reference_id, geo_status, reward_status, point_delta,
          point_ledger_id, idempotency_key, policy_version
        )
        SELECT e.id, e.group_id, e.source_user_id, $2, e.event_type, e.reference_type,
               e.reference_id, e.geo_status, $3, $4, $5, $6, 1
        FROM affiliate_events e WHERE e.global_id = $1
        ON CONFLICT DO NOTHING
      `,
      [event(1), beneficiary, status, delta, ledgerId, key],
    );
  }

  const outOfRange = affiliateRewardIdempotencyKey({
    beneficiaryUserId: Personas.coordinator,
    eventType: 'POST_CREATED',
    referenceType: 'POST',
    referenceId: seedId(SeedDomains.posts, 9),
  });
  await ctx.q(
    `
      INSERT INTO affiliate_rewards (
        event_id, group_id, source_user_id, beneficiary_user_id, event_type,
        reference_type, reference_id, geo_status, reward_status, point_delta,
        idempotency_key, policy_version
      )
      SELECT e.id, e.group_id, e.source_user_id, $2, e.event_type, e.reference_type,
             e.reference_id, e.geo_status, 'NOT_ELIGIBLE_GEO', 0, $3, 1
      FROM affiliate_events e WHERE e.global_id = $1
      ON CONFLICT DO NOTHING
    `,
    [event(2), Personas.coordinator, outOfRange],
  );
}
