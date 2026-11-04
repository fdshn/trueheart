import { ISeedContext, Personas, SeedDomains, seedId } from './seed-context';

/**
 * Dự án từ thiện 4 giai đoạn — đợt 1 (docs/plan/CHARITY-PROJECT-LIFECYCLE.md): hồ sơ tab A
 * đầy đủ cho chiến dịch mẫu 1 "Áo ấm cho học sinh vùng cao" để mobile thử workspace và bản
 * công khai ngay: lời kêu gọi, đơn vị liên quan, tài khoản nhận (một đã đóng), ban tổ chức,
 * tiến độ 4 bước, nhu cầu tiền và người, mục Kế hoạch đã công khai, form mở.
 */
export async function seedCharityProject(ctx: ISeedContext): Promise<void> {
  const [schema] = await ctx.q<{ ready: boolean }>(
    `SELECT to_regclass('public.campaign_volunteer_needs') IS NOT NULL AS ready`,
  );
  if (!schema?.ready) return;

  const campaignId = seedId(SeedDomains.campaigns, 1);
  const [exists] = await ctx.q<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM campaigns WHERE global_id = $1) AS ok`,
    [campaignId],
  );
  if (!exists?.ok) return;
  const [seeded] = await ctx.q(
    `SELECT 1 FROM campaign_team_members WHERE campaign_id = $1 LIMIT 1`,
    [campaignId],
  );
  if (!seeded) await seedProfile(ctx, campaignId);
  await seedEngagement(ctx, campaignId);
  await seedEvent(ctx, campaignId);
}

async function seedProfile(
  ctx: ISeedContext,
  campaignId: string,
): Promise<void> {
  await ctx.q(
    `UPDATE campaigns
     SET appeal_purpose = 'Giúp 300 học sinh ba điểm trường có áo ấm trước mùa rét.',
         appeal_audience = 'Học sinh tiểu học các điểm trường Lũng Cú, Sủng Là, Phố Bảng.',
         appeal_circumstance = 'Nhiệt độ xuống dưới 5°C từ tháng 12; nhiều em chỉ có một áo mỏng.',
         call_to_actions = ARRAY['LIKE', 'SUPPORT_AND_DONATE', 'JOIN']::text[]
     WHERE global_id = $1`,
    [campaignId],
  );
  await ctx.q(
    `INSERT INTO campaign_stage_events (campaign_id, from_stage, to_stage, actor_id, reason)
     VALUES ($1, 'PLAN', 'EXECUTION', $2, 'Admin duyệt')`,
    [campaignId, Personas.admin],
  );

  for (const [role, name, kind, hotline] of [
    ['ORGANIZER', 'CLB Thiện nguyện Trái tim vàng', null, '1900 1234'],
    ['BENEFICIARY', 'Điểm trường Lũng Cú', 'GROUP', null],
    ['LICENSING', 'UBND xã Lũng Cú', null, null],
    ['MEDIA', 'Báo Hà Giang', null, null],
  ] as const)
    await ctx.q(
      `INSERT INTO campaign_parties (campaign_id, role, name, beneficiary_kind, hotline, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [campaignId, role, name, kind, hotline, Personas.organizer],
    );

  await ctx.q(
    `INSERT INTO campaign_bank_accounts
       (campaign_id, label, bank_name, account_no, account_name, valid_from, valid_to,
        close_reason, created_by, closed_by)
     VALUES ($1, 'Tài khoản cũ', 'ACB', '9988776655', 'CLB TRAI TIM VANG',
             now() - interval '20 days', now() - interval '5 days', 'Đổi sang tài khoản chung', $2, $2)`,
    [campaignId, Personas.organizer],
  );
  const [account] = await ctx.q<{ global_id: string }>(
    `INSERT INTO campaign_bank_accounts (campaign_id, label, bank_name, account_no, account_name, created_by)
     VALUES ($1, 'Quỹ chung', 'Vietcombank', '0011223344', 'CLB TRAI TIM VANG', $2)
     RETURNING global_id`,
    [campaignId, Personas.organizer],
  );

  for (const [index, [role, name, userId]] of [
    ['GENERAL_LEAD', 'Anh Minh', Personas.organizer],
    ['FINANCE', 'Chị Lan', null],
    ['ADVANCE_TRANSPORT', 'Anh Hùng', null],
  ].entries())
    await ctx.q(
      `INSERT INTO campaign_team_members
         (campaign_id, role, display_name, user_id, bank_account_id, sort_order, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        campaignId,
        role,
        name,
        userId,
        role === 'FINANCE' ? account.global_id : null,
        index,
        Personas.organizer,
      ],
    );

  for (const [phase, from, to, method, mode] of [
    ['PLANNING', '20 days', '15 days', null, null],
    ['PREPARATION', '15 days', '-10 days', null, null],
    ['DISTRIBUTION', '-12 days', '-13 days', 'ON_SITE', null],
    ['REPORTING', '-14 days', '-20 days', null, 'ONLINE'],
  ] as const)
    await ctx.q(
      `INSERT INTO campaign_phases
         (campaign_id, phase, starts_at, ends_at, delivery_method, report_mode, updated_by)
       VALUES ($1, $2, now() - $3::interval, now() - $4::interval, $5, $6, $7)`,
      [campaignId, phase, from, to, method, mode, Personas.organizer],
    );

  await ctx.q(
    `INSERT INTO campaign_funding_needs
       (campaign_id, title, receiving_unit, bank_account_id, target_amount, confirmed_amount,
        external_amount, deadline, updated_by)
     VALUES ($1, 'Chi phí vận chuyển', 'CLB Trái tim vàng', $2, 15000000, 6000000, 2000000,
             now() + interval '9 days', $3)`,
    [campaignId, account.global_id, Personas.organizer],
  );

  const [volunteer] = await ctx.q<{ global_id: string }>(
    `INSERT INTO campaign_volunteer_needs
       (campaign_id, title, description, needed_count, location_label, updated_by)
     VALUES ($1, 'Bốc xếp và phát quà', 'Hỗ trợ bốc xếp, phát quà tại điểm trường', 6, 'Lũng Cú', $2)
     RETURNING global_id`,
    [campaignId, Personas.organizer],
  );
  await ctx.q(
    `INSERT INTO campaign_volunteer_registrations (volunteer_need_id, user_id, status, confirmed_at, confirmed_by)
     VALUES ($1, $2, 'CONFIRMED', now(), $3)`,
    [volunteer.global_id, Personas.giver, Personas.organizer],
  );

  const [section] = await ctx.q<{ global_id: string }>(
    `INSERT INTO campaign_custom_sections (campaign_id, parent_section, title, updated_by)
     VALUES ($1, 'PLAN', 'Thông tin thêm', $2) RETURNING global_id`,
    [campaignId, Personas.organizer],
  );
  await ctx.q(
    `INSERT INTO campaign_custom_fields (custom_section_id, label, field_type, value, updated_by)
     VALUES ($1, 'Size áo cần nhiều nhất', 'TEXT', '"Size 8–12"'::jsonb, $2)`,
    [section.global_id, Personas.organizer],
  );
  await ctx.q(
    `INSERT INTO campaign_section_states
       (campaign_id, section_key, saved_at, published_at, published_snapshot, updated_by)
     VALUES ($1, 'PLAN', now(), now(),
             jsonb_build_object('appealPurpose', 'Giúp 300 học sinh ba điểm trường có áo ấm trước mùa rét.'),
             $2)`,
    [campaignId, Personas.organizer],
  );
}

/**
 * Đợt 2 (§3.3, §3.4, §3.7, §3.10, §3.13): checklist tab B đang làm dở, hai revision (một quan
 * trọng — đã báo qua outbox), một người quan tâm, một lượt thích + bình luận, một bản in.
 */
async function seedEngagement(
  ctx: ISeedContext,
  campaignId: string,
): Promise<void> {
  const [schema] = await ctx.q<{ ready: boolean }>(
    `SELECT to_regclass('public.campaign_exports') IS NOT NULL AS ready`,
  );
  if (!schema?.ready) return;
  const [seeded] = await ctx.q(
    `SELECT 1 FROM campaign_tasks WHERE campaign_id = $1 LIMIT 1`,
    [campaignId],
  );
  if (seeded) return;

  for (const [index, [key, status]] of [
    ['LICENSING', 'DONE'],
    ['PROMOTION', 'DONE'],
    ['INTAKE', 'IN_PROGRESS'],
    ['MONITORING', 'TODO'],
    ['CLOSE_INTAKE', 'TODO'],
    ['PACKING', 'TODO'],
    ['PRE_EVENT_NOTICE', 'TODO'],
  ].entries())
    await ctx.q(
      `INSERT INTO campaign_tasks (campaign_id, task_key, status, sort_order, work_note, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        campaignId,
        key,
        status,
        index,
        status === 'DONE' ? 'Đã xong' : null,
        Personas.organizer,
      ],
    );

  await ctx.q(
    `INSERT INTO campaign_revisions
       (campaign_id, entity, entity_id, field, old_value, new_value, is_public, is_important,
        changed_by, created_at)
     VALUES ($1, 'CAMPAIGN', NULL, 'appealAudience', '"Học sinh tiểu học"'::jsonb,
             '"Học sinh tiểu học các điểm trường Lũng Cú, Sủng Là, Phố Bảng."'::jsonb,
             true, false, $2, now() - interval '3 days'),
            ($1, 'TASK', NULL, 'status', '"TODO"'::jsonb, '"DONE"'::jsonb, true, false, $2,
             now() - interval '2 days')`,
    [campaignId, Personas.organizer],
  );
  await ctx.q(
    `INSERT INTO campaign_announcements
       (campaign_id, kind, payload, actor_id, created_at, processed_at, recipient_count)
     VALUES ($1, 'PLAN_CHANGED',
             '{"changes":[{"entity":"PHASE","field":"startsAt"}]}'::jsonb, $2,
             now() - interval '1 day', now() - interval '1 day', 1)`,
    [campaignId, Personas.organizer],
  );
  await ctx.q(
    `INSERT INTO campaign_follows (campaign_id, user_id) VALUES ($1, $2)`,
    [campaignId, Personas.giver],
  );
  await ctx.q(
    `INSERT INTO content_reactions (subject_type, subject_id, user_id, kind)
     VALUES ('CHARITY_CAMPAIGN', $1, $2, 'LOVE')`,
    [campaignId, Personas.giver],
  );
  await ctx.q(
    `INSERT INTO content_comments (global_id, subject_type, subject_id, author_id, body, depth, status)
     VALUES (gen_random_uuid(), 'CHARITY_CAMPAIGN', $1, $2,
             'Mình góp được 10 áo size 10, tuần sau gửi nhé.', 1, 'VISIBLE')`,
    [campaignId, Personas.giver],
  );
  await ctx.q(
    `INSERT INTO campaign_exports (campaign_id, section_key, snapshot, generated_by)
     VALUES ($1, 'PLAN',
             jsonb_build_object('title', 'Áo ấm cho học sinh vùng cao', 'sections', '[]'::jsonb),
             $2)`,
    [campaignId, Personas.organizer],
  );
}

/**
 * Đợt 3 (§3.5): timeline đang chạy dở, một cộng tác viên sự kiện, hai bài (một của ban tổ chức
 * có ảnh, một của cộng tác viên), một lượt ký đã dùng và một lượt ký bỏ dở.
 */
async function seedEvent(ctx: ISeedContext, campaignId: string): Promise<void> {
  const [schema] = await ctx.q<{ ready: boolean }>(
    `SELECT to_regclass('public.campaign_post_uploads') IS NOT NULL AS ready`,
  );
  if (!schema?.ready) return;
  const [seeded] = await ctx.q(
    `SELECT 1 FROM campaign_event_steps WHERE campaign_id = $1 LIMIT 1`,
    [campaignId],
  );
  if (seeded) return;

  for (const [index, key] of [
    'GATHER',
    'BRIEFING',
    'TRAVEL',
    'REST_STOP',
    'ARRIVE',
    'MEET_LOCAL_AUTHORITY',
    'MEET_RECIPIENTS',
    'DISTRIBUTE',
    'WRAP_UP',
    'RETURN',
  ].entries())
    await ctx.q(
      `INSERT INTO campaign_event_steps
         (campaign_id, step_key, sort_order, status, actual_at, planned_at, updated_by)
       VALUES ($1, $2, $3::smallint,
               CASE WHEN $5::int < 3 THEN 'DONE' WHEN $5::int = 3 THEN 'IN_PROGRESS' ELSE 'PENDING' END,
               CASE WHEN $5::int < 3 THEN now() - make_interval(hours => 5 - $5::int) END,
               now() + make_interval(hours => $5::int - 3), $4)`,
      [campaignId, key, index, Personas.organizer, index],
    );

  await ctx.q(
    `INSERT INTO campaign_event_contributors (campaign_id, user_id, granted_by)
     VALUES ($1, $2, $3)`,
    [campaignId, Personas.giver, Personas.organizer],
  );

  const organizerKey = `users/${Personas.organizer}/campaign-media/seed-event-1.webp`;
  const abandonedKey = `users/${Personas.giver}/campaign-media/seed-event-abandoned.webp`;
  await ctx.q(
    `INSERT INTO campaign_post_uploads (campaign_id, user_id, storage_key, media_type, consumed_at)
     VALUES ($1, $2, $3, 'IMAGE', now()), ($1, $4, $5, 'IMAGE', NULL)`,
    [
      campaignId,
      Personas.organizer,
      organizerKey,
      Personas.giver,
      abandonedKey,
    ],
  );
  const [post] = await ctx.q<{ global_id: string }>(
    `INSERT INTO campaign_posts (campaign_id, author_id, author_role, stage, body)
     VALUES ($1, $2, 'ORGANIZER', 'EVENT', 'Đoàn đã tập hợp đủ, chuẩn bị lên đường.')
     RETURNING global_id`,
    [campaignId, Personas.organizer],
  );
  await ctx.q(
    `INSERT INTO campaign_post_media (post_id, storage_key, public_url, media_type, sort_order)
     VALUES ($1, $2, 'https://placehold.co/800x600.png', 'IMAGE', 0)`,
    [post.global_id, organizerKey],
  );
  await ctx.q(
    `INSERT INTO campaign_posts (campaign_id, author_id, author_role, stage, body)
     VALUES ($1, $2, 'PARTICIPANT', 'EVENT', 'Các em nhận áo vui lắm!')`,
    [campaignId, Personas.giver],
  );
}
