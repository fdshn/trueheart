import { referralCodeCandidates } from '@chantam.vn/chantam.core-lib/models';
import { hash } from 'bcryptjs';
import { createHash } from 'node:crypto';
import { DemoPassword } from '../seed-demo-data';
import { ISeedContext, Personas } from './seed-context';

const NewUsers = [
  {
    id: Personas.admin,
    username: 'demo-quan-tri',
    fullName: 'Phạm Quân — Quản trị demo',
    rank: 'DIAMOND',
    status: 'ACTIVE',
    phone: '+84900000101',
    role: 'SUPER_ADMIN',
  },
  {
    id: Personas.organizer,
    username: 'demo-to-chuc',
    fullName: 'Võ Hạnh — Người tổ chức từ thiện',
    rank: 'DIAMOND',
    status: 'ACTIVE',
    phone: '+84900000102',
    role: null,
  },
  {
    id: Personas.groupOwner,
    username: 'demo-truong-nhom',
    fullName: 'Đỗ Minh — Trưởng nhóm thiện nguyện',
    rank: 'SILVER',
    status: 'ACTIVE',
    phone: '+84900000103',
    role: null,
  },
  {
    id: Personas.coordinator,
    username: 'demo-dieu-phoi',
    fullName: 'Hồ Lan — Điều phối viên',
    rank: 'MEMBER',
    status: 'ACTIVE',
    phone: '+84900000104',
    role: null,
  },
  {
    id: Personas.newcomer,
    username: 'demo-thanh-vien-moi',
    fullName: 'Mai Thu — Mới đăng ký, chưa xác minh SĐT',
    rank: 'VIEWER',
    status: 'ACTIVE',
    phone: null,
    role: null,
  },
  {
    id: Personas.suspended,
    username: 'demo-bi-tam-khoa',
    fullName: 'Lý Tâm — Đang bị tạm khoá',
    rank: 'MEMBER',
    status: 'SUSPENDED',
    phone: '+84900000106',
    role: null,
  },
  {
    id: Personas.auditor,
    username: 'demo-kiem-toan',
    fullName: 'Trịnh Khoa — Kiểm toán (chỉ đọc)',
    rank: 'MEMBER',
    status: 'ACTIVE',
    phone: '+84900000107',
    role: 'AUDITOR',
  },
  {
    id: Personas.giver2,
    username: 'demo-nguoi-tang-2',
    fullName: 'Bùi Sơn — Người tặng thứ hai',
    rank: 'SILVER',
    status: 'ACTIVE',
    phone: '+84900000108',
    role: null,
  },
] as const;

/** Mọi người dùng đã xác minh SĐT — cả ba user demo cũ lẫn người mới. */
const VerifiedPhones: ReadonlyArray<[string, string]> = [
  [Personas.giver, '+84900000001'],
  [Personas.receiver, '+84900000002'],
  [Personas.moderator, '+84900000003'],
  ...NewUsers.filter((user) => user.phone !== null).map(
    (user) => [user.id, user.phone as string] as [string, string],
  ),
];

export const SeededUserIds = NewUsers.map((user) => user.id);

/**
 * Người dùng, vai trò Admin, SĐT, onboarding, giới thiệu, hạng.
 *
 * Mã giới thiệu chọn ứng viên đầu tiên CHƯA có ai trong database giữ — khác seed demo cũ
 * chỉ tránh trùng trong ba người của nó, vì seed này chạy trên database đã có người thật.
 */
export async function seedPeople(ctx: ISeedContext): Promise<void> {
  const passwordHash = await hash(DemoPassword, 12);

  for (const user of NewUsers) {
    const [existing] = await ctx.q<{ referral_code: string | null }>(
      `SELECT referral_code FROM users WHERE global_id = $1`,
      [user.id],
    );
    let code = existing?.referral_code ?? null;
    if (code === null)
      for (const candidate of referralCodeCandidates(user.id)) {
        const [taken] = await ctx.q(
          `SELECT 1 FROM users WHERE referral_code = $1`,
          [candidate],
        );
        if (!taken) {
          code = candidate;
          break;
        }
      }

    await ctx.q(
      `
        INSERT INTO users (
          global_id, username, password_hash, email, phone, full_name, rank, status,
          phone_verified_at, suspended_until, default_location, referral_code,
          rank_attained_at
        )
        VALUES (
          $1, $2, $3, $4, $5::varchar, $6, $7::users_rank_enum, $8::users_status_enum,
          CASE WHEN $5::varchar IS NULL THEN NULL ELSE now() - interval '30 days' END,
          CASE WHEN $8::users_status_enum = 'SUSPENDED' THEN now() + interval '7 days' END,
          ST_SetSRID(ST_MakePoint(105.835, 21.028), 4326)::geography,
          $9, now() - interval '30 days'
        )
        ON CONFLICT (global_id) DO UPDATE SET
          username = EXCLUDED.username,
          password_hash = EXCLUDED.password_hash,
          full_name = EXCLUDED.full_name,
          rank = EXCLUDED.rank,
          status = EXCLUDED.status,
          suspended_until = EXCLUDED.suspended_until,
          deleted_at = NULL,
          updated_at = now()
      `,
      [
        user.id,
        user.username,
        passwordHash,
        `${user.username}@chantam.local`,
        user.phone,
        user.fullName,
        user.rank,
        user.status,
        code,
      ],
    );

    if (user.role)
      await ctx.q(
        `
          INSERT INTO admin_user_roles (user_id, role_id)
          SELECT $1, role.id FROM admin_roles role WHERE role.code = $2
          ON CONFLICT DO NOTHING
        `,
        [user.id, user.role],
      );
  }

  // SĐT của ba user demo cũ: seed cũ chỉ đặt `phone_verified_at`, không đặt `phone`.
  for (const [userId, phone] of VerifiedPhones.slice(0, 3))
    await ctx.q(
      `UPDATE users SET phone = $2 WHERE global_id = $1 AND phone IS NULL`,
      [userId, phone],
    );

  // Băm qua đúng repository của app: có `PHONE_HASH_PEPPER` thì HMAC, và seed tự băm
  // bằng SHA-256 trơn sẽ ra một dòng không bao giờ khớp lượt xác minh thật nào.
  for (const [userId, phone] of VerifiedPhones)
    await ctx.phones.claim({ phone, userId });

  // Onboarding: mọi người đã xác minh làm xong cả hai việc; người mới chỉ xong hồ sơ.
  for (const [userId] of VerifiedPhones)
    await ctx.q(
      `
        INSERT INTO user_onboarding_task_completions (user_id, task_id, evidence_ref)
        SELECT $1, task.global_id, 'seed:' || task.key FROM onboarding_tasks task
        WHERE task.active AND task.deleted_at IS NULL
        ON CONFLICT DO NOTHING
      `,
      [userId],
    );
  await ctx.q(
    `
      INSERT INTO user_onboarding_task_completions (user_id, task_id, evidence_ref)
      SELECT $1, task.global_id, 'seed:PROFILE_COMPLETE' FROM onboarding_tasks task
      WHERE task.key = 'PROFILE_COMPLETE'
      ON CONFLICT DO NOTHING
    `,
    [Personas.newcomer],
  );

  for (const [userId] of VerifiedPhones) {
    await ctx.ledger.appendByRule({
      userId,
      ruleCode: 'PHONE_VERIFIED_FIRST_TIME',
      referenceType: 'PHONE_VERIFICATION',
      referenceId: userId,
      idempotencyKey: `PHONE_VERIFIED_FIRST_TIME:${userId}`,
      actor: 'SYSTEM',
      source: 'PROFILE',
    });
    await ctx.ledger.appendByRule({
      userId,
      ruleCode: 'ONBOARDING_COMPLETED',
      referenceType: 'ONBOARDING',
      referenceId: userId,
      idempotencyKey: `ONBOARDING_COMPLETED:${userId}`,
      actor: 'SYSTEM',
      source: 'ONBOARDING',
    });
  }

  // Giới thiệu: một lượt ĐÃ đủ điều kiện (có thưởng), một lượt còn treo.
  const giverCode = await referralCodeOf(ctx, Personas.giver);
  const groupOwnerCode = await referralCodeOf(ctx, Personas.groupOwner);
  const reward = await ctx.ledger.appendByRule({
    userId: Personas.groupOwner,
    ruleCode: 'REFERRAL_QUALIFIED',
    referenceType: 'REFERRAL',
    referenceId: Personas.coordinator,
    idempotencyKey: `REFERRAL_QUALIFIED:${Personas.coordinator}`,
    actor: 'SYSTEM',
    source: 'REFERRAL',
  });
  await ctx.q(
    `
      INSERT INTO referrals (referrer_id, referee_id, code, qualified_at, reward_entry_id)
      VALUES ($1, $2, $3, now() - interval '20 days', $4)
      ON CONFLICT (referee_id) DO NOTHING
    `,
    [Personas.groupOwner, Personas.coordinator, groupOwnerCode, reward.entryId],
  );
  await ctx.q(
    `
      INSERT INTO referrals (referrer_id, referee_id, code)
      VALUES ($1, $2, $3)
      ON CONFLICT (referee_id) DO NOTHING
    `,
    [Personas.giver, Personas.newcomer, giverCode],
  );

  // Hạng: lịch sử lên hạng và một chu kỳ duy trì đang chạy cho người hạng Vàng.
  for (const [userId, from, to] of [
    [Personas.giver, 'MEMBER', 'SILVER'],
    [Personas.giver, 'SILVER', 'GOLD'],
    [Personas.organizer, 'GOLD', 'DIAMOND'],
  ] as const)
    await ctx.q(
      `
        INSERT INTO rank_transitions
          (user_id, from_rank, to_rank, reason, points_at_transition, actor)
        SELECT $1, $2::users_rank_enum, $3::users_rank_enum, 'SEED_PROMOTION', 0, 'SEED'
        WHERE NOT EXISTS (
          SELECT 1 FROM rank_transitions
          WHERE user_id = $1 AND from_rank = $2::users_rank_enum
            AND to_rank = $3::users_rank_enum AND actor = 'SEED'
        )
      `,
      [userId, from, to],
    );
  await ctx.q(
    `
      INSERT INTO rank_maintenance_cycles (
        user_id, rank, cycle_start, cycle_end, gifts_done, referrals_done,
        required_gifts, required_referrals, policy_version
      )
      -- Ngưỡng lấy từ rank_tiers như app làm, không chép số tay.
      SELECT $1, 'GOLD', date_trunc('month', now()),
             date_trunc('month', now()) + interval '3 months', 1, 0,
             maintenance_gifts, maintenance_referrals, version
      FROM rank_tiers WHERE rank = 'GOLD'
      ON CONFLICT (user_id, cycle_start) DO NOTHING
    `,
    [Personas.giver],
  );

  // Phiên đăng nhập đã THU HỒI, cùng lối seed cũ: không tạo refresh token còn dùng được.
  for (const userId of SeededUserIds)
    await ctx.q(
      `
        INSERT INTO user_sessions (user_id, refresh_token_hash, device_id, expires_at, revoked_at)
        VALUES ($1, $2, 'seed-full-device', now() - interval '1 day', now())
        ON CONFLICT (refresh_token_hash) DO NOTHING
      `,
      [
        userId,
        createHash('sha256').update(`seed-full:${userId}`).digest('hex'),
      ],
    );

  await ctx.q(
    `
      INSERT INTO notification_mutes (user_id, notification_group)
      VALUES ($1, 'EVENT')
      ON CONFLICT (user_id, notification_group) DO NOTHING
    `,
    [Personas.receiver],
  );

  await ctx.q(
    `
      INSERT INTO admin_audit_logs
        (actor_user_id, action, resource_type, resource_id, after_json, reason)
      SELECT $1, 'SEED_DATA_LOADED', 'SYSTEM', 'seed-full', '{"by":"seed:full"}'::jsonb,
             'Nạp bộ dữ liệu thử đầy đủ'
      WHERE NOT EXISTS (
        SELECT 1 FROM admin_audit_logs WHERE action = 'SEED_DATA_LOADED'
      )
    `,
    [Personas.admin],
  );
}

async function referralCodeOf(
  ctx: ISeedContext,
  userId: string,
): Promise<string> {
  const [row] = await ctx.q<{ referral_code: string }>(
    `SELECT referral_code FROM users WHERE global_id = $1`,
    [userId],
  );
  return row.referral_code;
}
