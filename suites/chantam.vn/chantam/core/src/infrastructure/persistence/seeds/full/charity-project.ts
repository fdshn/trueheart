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
  await seedSummary(ctx, seedId(SeedDomains.campaigns, 4));
  await seedOperations(ctx, campaignId);
  await seedDispute(ctx);
}

/**
 * Đợt 5c (bổ sung): một tranh chấp đã giải quyết trên một đóng góp được chấp nhận — người góp
 * mở, ban tổ chức kết luận. Không để tranh chấp MỞ: nó chặn hoàn tất dự án mẫu.
 */
async function seedDispute(ctx: ISeedContext): Promise<void> {
  const [schema] = await ctx.q<{ ready: boolean }>(
    `SELECT to_regclass('public.campaign_contribution_disputes') IS NOT NULL AS ready`,
  );
  if (!schema?.ready) return;
  const [seeded] = await ctx.q(
    `SELECT 1 FROM campaign_contribution_disputes LIMIT 1`,
  );
  if (seeded) return;
  const [contribution] = await ctx.q<{
    global_id: string;
    campaign_id: string;
    contributor_id: string;
    created_by: string;
  }>(
    `SELECT contribution.global_id, contribution.campaign_id, contribution.contributor_id,
            campaign.created_by
     FROM campaign_contributions contribution
     JOIN campaigns campaign ON campaign.global_id = contribution.campaign_id
     WHERE contribution.status IN ('ACCEPTED', 'PARTIALLY_ACCEPTED')
     ORDER BY contribution.id LIMIT 1`,
  );
  if (!contribution) return;
  await ctx.q(
    `INSERT INTO campaign_contribution_disputes
       (campaign_id, contribution_id, opened_by, opened_by_party, reason, description,
        evidence_urls, status, resolution, closed_by, closed_at)
     VALUES ($1, $2, $3, 'CONTRIBUTOR', 'QUANTITY_MISMATCH',
             'Tôi gửi 20 áo nhưng biên nhận chỉ ghi 15 áo',
             '["https://placehold.co/600x800.png"]'::jsonb, 'RESOLVED',
             'Đếm lại kho: đủ 20 áo, đã sửa biên nhận', $4, now() - interval '1 day')`,
    [
      contribution.campaign_id,
      contribution.global_id,
      contribution.contributor_id,
      contribution.created_by,
    ],
  );
}

/**
 * Đợt 5b/5c (quyết định 05/11): một hạng mục hỗ trợ mở (chuyến xe) có ba đề nghị ở ba trạng
 * thái và nguồn ngoài kèm bằng chứng; hai đợt trao — một sắp tới (đã gắn người tặng, checklist
 * dở), một đã huỷ có lý do — mỗi đợt timeline riêng.
 */
async function seedOperations(
  ctx: ISeedContext,
  campaignId: string,
): Promise<void> {
  const [schema] = await ctx.q<{ ready: boolean }>(
    `SELECT to_regclass('public.campaign_distribution_rounds') IS NOT NULL AS ready`,
  );
  if (!schema?.ready) return;
  const [seeded] = await ctx.q(
    `SELECT 1 FROM campaign_other_support_needs WHERE campaign_id = $1 LIMIT 1`,
    [campaignId],
  );
  if (seeded) return;

  const [need] = await ctx.q<{ global_id: string }>(
    `INSERT INTO campaign_other_support_needs
       (campaign_id, support_type, title, description, unit, target_quantity, location_label,
        handover_method, pic_name, pic_phone, external_quantity, external_evidence_urls,
        external_note, created_by, updated_by)
     VALUES ($1, 'TRANSPORT', 'Xe 16 chỗ chở quà lên điểm trường', 'Hai chiều, xuất phát 5 giờ sáng',
             'chuyến', 4, 'Kho Cầu Giấy → Mèo Vạc', 'Đón tại kho', 'Anh Tư', '0900000004', 1,
             '["https://placehold.co/600x400.png"]'::jsonb, 'Nhà xe Hùng Cường tặng một chuyến',
             $2, $2)
     RETURNING global_id`,
    [campaignId, Personas.organizer],
  );
  for (const [userId, quantity, status] of [
    [Personas.giver, 1, 'COMPLETED'],
    [Personas.giver2, 1, 'ACCEPTED'],
    [Personas.receiver, 1, 'PENDING'],
  ] as const)
    await ctx.q(
      `INSERT INTO campaign_other_support_offers
         (need_id, user_id, quantity, completed_quantity, status, decided_by, decided_at, note)
       VALUES ($1, $2, $3::int, CASE WHEN $4::text = 'COMPLETED' THEN $3::int END, $4::text,
               CASE WHEN $4::text <> 'PENDING' THEN $5::uuid END,
               CASE WHEN $4::text <> 'PENDING' THEN now() - interval '1 day' END,
               'Có xe riêng, chạy được đường núi')`,
      [need.global_id, userId, quantity, status, Personas.organizer],
    );

  const [upcoming] = await ctx.q<{ global_id: string }>(
    `INSERT INTO campaign_distribution_rounds
       (campaign_id, title, location_label, address, starts_at, ends_at, readiness, checklist,
        created_by, updated_by)
     VALUES ($1, 'Đợt 1 — Điểm trường Sủng Trà', 'Mèo Vạc, Hà Giang', 'Thôn Sủng Trà',
             now() + interval '30 hours', now() + interval '36 hours', 'PENDING',
             '[{"key":"TRANSPORT","done":true,"note":null},{"key":"GOODS_PACKED","done":false,"note":"Còn 40 áo"}]'::jsonb,
             $2, $2)
     RETURNING global_id`,
    [campaignId, Personas.organizer],
  );
  const [cancelled] = await ctx.q<{ global_id: string }>(
    `INSERT INTO campaign_distribution_rounds
       (campaign_id, title, location_label, starts_at, ends_at, status, status_reason,
        created_by, updated_by)
     VALUES ($1, 'Đợt 2 — Điểm trường Pải Lủng', 'Mèo Vạc, Hà Giang', now() + interval '10 days',
             now() + interval '10 days 6 hours', 'CANCELLED', 'Địa phương đã có đoàn khác trao',
             $2, $2)
     RETURNING global_id`,
    [campaignId, Personas.organizer],
  );
  for (const roundId of [upcoming.global_id, cancelled.global_id])
    await ctx.q(
      `INSERT INTO campaign_event_steps (campaign_id, round_id, step_key, sort_order)
       SELECT $1, $2, step.key, step.sort_order
       FROM unnest($3::text[], $4::int[]) AS step(key, sort_order)`,
      [
        campaignId,
        roundId,
        [
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
        ],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      ],
    );
  await ctx.q(
    `UPDATE campaign_participations SET round_id = $2
      WHERE campaign_id = $1 AND user_id = $3`,
    [campaignId, upcoming.global_id, Personas.giver],
  );
  await ctx.q(
    `INSERT INTO campaign_announcements (campaign_id, kind, payload, actor_id)
     VALUES ($1, 'ROUND_CHANGED', $2::jsonb, $3)`,
    [
      campaignId,
      JSON.stringify({
        roundId: cancelled.global_id,
        roundTitle: 'Đợt 2 — Điểm trường Pải Lủng',
        change: 'CANCELLED',
        reason: 'Địa phương đã có đoàn khác trao',
      }),
      Personas.organizer,
    ],
  );
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

  // Participant đã check-in — được đăng ảnh/clip sự kiện (chốt 05/11, thay cộng tác viên).
  // Schema giữa đợt 3 và 1802900000000 chưa có check-in: bỏ qua.
  const [lifecycle] = await ctx.q<{ ready: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'campaign_participations'
                      AND column_name = 'checked_in_at') AS ready`,
  );
  if (lifecycle?.ready)
    await ctx.q(
      `INSERT INTO campaign_participations
       (campaign_id, user_id, status, registered_at, status_changed_at, status_changed_by,
        checked_in_at, checked_in_by)
     VALUES ($1, $2, 'CHECKED_IN', now() - interval '3 days', now() - interval '2 hours', $3,
             now() - interval '2 hours', $3)
     ON CONFLICT (campaign_id, user_id) DO UPDATE
       SET status = 'CHECKED_IN', cancelled_at = NULL,
           status_changed_at = EXCLUDED.status_changed_at,
           status_changed_by = EXCLUDED.status_changed_by,
           checked_in_at = EXCLUDED.checked_in_at, checked_in_by = EXCLUDED.checked_in_by`,
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

/**
 * Đợt 4a (§3.6): chiến dịch mẫu 4 (đã sang Tổng kết) có tổng kết đã công khai, một báo cáo tài
 * chính kèm sao kê, một người tham gia được chấm hai lần (giữ lịch sử).
 */
async function seedSummary(
  ctx: ISeedContext,
  campaignId: string,
): Promise<void> {
  const [schema] = await ctx.q<{ ready: boolean }>(
    `SELECT to_regclass('public.campaign_participant_evaluations') IS NOT NULL AS ready`,
  );
  if (!schema?.ready) return;
  const [exists] = await ctx.q<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM campaigns WHERE global_id = $1) AS ok`,
    [campaignId],
  );
  if (!exists?.ok) return;
  const [seeded] = await ctx.q(
    `SELECT 1 FROM campaign_summaries WHERE campaign_id = $1`,
    [campaignId],
  );
  if (seeded) return;

  await ctx.q(
    `INSERT INTO campaign_summaries
       (campaign_id, summary, usage_report, thanks_message, lessons_learned, evidence_urls,
        published_at, updated_by)
     VALUES ($1, 'Đã trao 120 phần quà Trung thu cho các em xóm chạy thận.',
             'Bánh, đèn lồng, sữa; chi tiết ở báo cáo tài chính.',
             'Cảm ơn 30 nhà hảo tâm và 12 tình nguyện viên.',
             'Cần chốt danh sách các em sớm hơn một tuần.',
             '["https://placehold.co/800x600.png"]'::jsonb, now() - interval '2 days', $2)`,
    [campaignId, Personas.organizer],
  );
  await ctx.q(
    `INSERT INTO campaign_financial_reports
       (campaign_id, period_from, period_to, total_income, total_expense, explanation,
        statement_urls, updated_by)
     VALUES ($1, (now() - interval '40 days')::date, (now() - interval '3 days')::date,
             12000000, 11250000, 'Mua bánh, đèn lồng, sữa và thuê xe.',
             '["https://placehold.co/600x800.png"]'::jsonb, $2)`,
    [campaignId, Personas.organizer],
  );
  for (const [score, note] of [
    [70, 'Đến muộn buổi sáng'],
    [85, 'Chấm lại sau khi đối chiếu điểm danh'],
  ] as const)
    await ctx.q(
      `INSERT INTO campaign_participant_evaluations
         (campaign_id, participant_id, completion_score, note, evaluated_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [campaignId, Personas.giver, score, note, Personas.organizer],
    );
  await seedPointsAndAppeal(ctx, campaignId);
}

/**
 * Đợt 4b (§3.9, §3.16): một award điểm tham gia (rule đang TẮT nên 0/0 — seed KHÔNG phát điểm,
 * không thì job `charity:points` sẽ ghi điểm thật trên môi trường dev) và một khiếu nại đã đóng
 * đủ ba bước nhật ký.
 */
async function seedPointsAndAppeal(
  ctx: ISeedContext,
  campaignId: string,
): Promise<void> {
  const [schema] = await ctx.q<{ ready: boolean }>(
    `SELECT to_regclass('public.campaign_appeal_events') IS NOT NULL AS ready`,
  );
  if (!schema?.ready) return;
  const [seeded] = await ctx.q(
    `SELECT 1 FROM campaign_appeals WHERE campaign_id = $1`,
    [campaignId],
  );
  if (seeded) return;
  await ctx.q(
    `INSERT INTO campaign_point_awards
       (campaign_id, user_id, rule_code, reference_type, reference_id, target_points, reason)
     VALUES ($1, $2, 'CHARITY_PARTICIPATION', 'CHARITY_PARTICIPATION', $3,
             0, 'Tham gia dự án (rule đang tắt)')
     ON CONFLICT DO NOTHING`,
    [campaignId, Personas.giver, `${campaignId}:${Personas.giver}`],
  );
  const [evaluation] = await ctx.q<{ global_id: string }>(
    `SELECT global_id FROM campaign_participant_evaluations
     WHERE campaign_id = $1 AND participant_id = $2 ORDER BY id DESC LIMIT 1`,
    [campaignId, Personas.giver],
  );
  if (!evaluation) return;
  const [appeal] = await ctx.q<{ global_id: string }>(
    `INSERT INTO campaign_appeals
       (campaign_id, appellant_id, target_type, target_id, original_value, requested_value,
        description, status, organizer_decision, organizer_value, organizer_reason,
        organizer_decided_by, organizer_decided_at, outcome, organizer_due_at, closed_at)
     VALUES ($1, $2, 'EVALUATION', $3, 85, 100, 'Tôi ở lại tới khi dọn xong sân trường.',
             'CLOSED', 'KEEP', NULL, 'Điểm đã tính cả phần dọn dẹp.', $4, now() - interval '1 day',
             'KEPT_ACCEPTED', now() + interval '2 days', now() - interval '12 hours')
     RETURNING global_id`,
    [campaignId, Personas.giver, evaluation.global_id, Personas.organizer],
  );
  for (const [actor, action, from, to] of [
    [Personas.giver, 'SUBMIT', null, 'ORGANIZER_REVIEW'],
    [
      Personas.organizer,
      'ORGANIZER_KEEP',
      'ORGANIZER_REVIEW',
      'AWAITING_APPELLANT',
    ],
    [Personas.giver, 'APPELLANT_ACCEPT', 'AWAITING_APPELLANT', 'CLOSED'],
  ] as const)
    await ctx.q(
      `INSERT INTO campaign_appeal_events (appeal_id, actor_id, action, from_status, to_status)
       VALUES ($1, $2, $3, $4, $5)`,
      [appeal.global_id, actor, action, from, to],
    );
}
