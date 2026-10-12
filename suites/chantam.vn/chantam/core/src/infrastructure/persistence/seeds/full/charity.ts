import {
  Categories,
  ISeedContext,
  Personas,
  SeedDomains,
  seedId,
} from './seed-context';

const campaign = (n: number) => seedId(SeedDomains.campaigns, n);
const need = (n: number) => seedId(SeedDomains.needItems, n);
const contribution = (n: number) => seedId(SeedDomains.contributions, n);
const contributionItem = (n: number) =>
  seedId(SeedDomains.contributionItems, n);
const delivery = (n: number) => seedId(SeedDomains.deliveries, n);

const Banner = 'https://placehold.co/1200x600.png';

/**
 * Sáu hoạt động phủ đủ bảng trạng thái F65b §8.
 *
 * Trạng thái hiển thị KHÔNG có cột riêng — nó suy ra từ (approval_status, is_active,
 * end_time): ACTIVE = APPROVED + đang bật; SUSPENDED = APPROVED + tắt + chưa hết hạn;
 * CLOSED = APPROVED + tắt + đã hết hạn. Seed ghi đúng bộ ba đó, không ghi chữ ACTIVE
 * hay CLOSED vào `approval_status`.
 */
const Campaigns = [
  {
    n: 1,
    title: 'Áo ấm cho học sinh vùng cao',
    slug: 'seed-ao-am-vung-cao',
    type: 'ORGANIZED_CAMPAIGN',
    relation: null,
    approval: 'APPROVED',
    active: true,
    ends: `now() + interval '30 days'`,
    starts: `now() - interval '15 days'`,
    organizer: Personas.organizer,
    overTarget: false,
    description:
      'Gom áo ấm, chăn và sách vở cho ba điểm trường ở Hà Giang trước mùa rét. Đang nhận đóng góp.',
  },
  {
    n: 2,
    title: 'Xin sữa cho cụ bà sống một mình',
    slug: 'seed-sua-cho-cu-ba',
    type: 'INDIVIDUAL_APPEAL',
    relation: 'OTHER',
    approval: 'PENDING_APPROVAL',
    active: true,
    ends: `now() + interval '20 days'`,
    starts: `now() - interval '1 day'`,
    organizer: Personas.giver2,
    overTarget: false,
    description:
      'Kêu gọi cho hàng xóm. Người thụ hưởng CHƯA xác nhận đồng ý nên đang chờ duyệt.',
  },
  {
    n: 3,
    title: 'Mình cần xe lăn sau tai nạn',
    slug: 'seed-can-xe-lan',
    type: 'INDIVIDUAL_APPEAL',
    relation: 'SELF',
    approval: 'APPROVED',
    active: true,
    ends: `now() + interval '10 days'`,
    starts: `now() - interval '5 days'`,
    organizer: Personas.receiver,
    overTarget: true,
    description:
      'Kêu gọi cho chính mình, cho phép nhận vượt mục tiêu (allow_over_target).',
  },
  {
    n: 4,
    title: 'Trung thu cho trẻ em xóm chạy thận',
    slug: 'seed-trung-thu-xom-chay-than',
    type: 'ORGANIZED_CAMPAIGN',
    relation: null,
    approval: 'APPROVED',
    active: false,
    ends: `now() - interval '5 days'`,
    starts: `now() - interval '45 days'`,
    organizer: Personas.organizer,
    overTarget: false,
    description:
      'Hoạt động ĐÃ ĐÓNG, đã gia hạn một lần. Có người tham gia và đánh giá sau sự kiện.',
  },
  {
    n: 5,
    title: 'Thuốc cho chú bảo vệ bị tai biến',
    slug: 'seed-thuoc-cho-chu-bao-ve',
    type: 'INDIVIDUAL_APPEAL',
    relation: 'OTHER',
    approval: 'APPROVED',
    active: false,
    ends: `now() + interval '12 days'`,
    starts: `now() - interval '8 days'`,
    organizer: Personas.coordinator,
    overTarget: false,
    description:
      'Hoạt động ĐÌNH CHỈ: gia đình rút lại đồng ý nên hệ thống tự ẩn.',
  },
  {
    n: 6,
    title: 'Gây quỹ mua xe máy cá nhân',
    slug: 'seed-gay-quy-xe-may',
    type: 'INDIVIDUAL_APPEAL',
    relation: 'SELF',
    approval: 'REJECTED',
    active: true,
    ends: `now() + interval '30 days'`,
    starts: `now() - interval '3 days'`,
    organizer: Personas.suspended,
    overTarget: false,
    description:
      'Bị từ chối vì không phải nhu cầu thiết yếu. Test hiển thị lý do từ chối.',
  },
] as const;

const Needs: ReadonlyArray<
  [number, number, string, string, number, string | null]
> = [
  [1, 1, 'Áo ấm trẻ em', 'cái', 100, Categories.clothes],
  [2, 1, 'Chăn bông', 'cái', 50, Categories.household],
  [3, 1, 'Vở ô li', 'cuốn', 200, Categories.books],
  [4, 2, 'Sữa bột người già', 'hộp', 20, Categories.food],
  [5, 3, 'Xe lăn', 'chiếc', 1, Categories.medical],
  [6, 4, 'Đèn lồng', 'cái', 60, Categories.other],
  [7, 4, 'Bánh trung thu', 'hộp', 60, Categories.food],
  [8, 5, 'Thuốc huyết áp', 'hộp', 12, Categories.medical],
  [9, 6, 'Xe máy', 'chiếc', 1, Categories.vehicles],
];

/**
 * [n, campaign, người góp, trạng thái, dòng [nhu cầu, đề nghị, chấp nhận, lý do từ chối]].
 * `chấp nhận = null` là dòng chưa quyết (PENDING_REVIEW/WITHDRAWN).
 */
const Contributions: ReadonlyArray<
  [
    number,
    number,
    string,
    string,
    ReadonlyArray<[number, number, number | null, string | null]>,
  ]
> = [
  [
    1,
    1,
    Personas.giver,
    'ACCEPTED',
    [
      [1, 20, 20, null],
      [2, 5, 5, null],
    ],
  ],
  [
    2,
    1,
    Personas.receiver,
    'PARTIALLY_ACCEPTED',
    [[1, 10, 6, 'QUALITY_NOT_ACCEPTABLE']],
  ],
  [3, 1, Personas.groupOwner, 'PENDING_REVIEW', [[3, 30, null, null]]],
  [4, 1, Personas.giver2, 'REJECTED', [[2, 3, 0, 'NOT_MATCH_REQUIREMENT']]],
  [5, 1, Personas.auditor, 'WITHDRAWN', [[3, 10, null, null]]],
  [6, 1, Personas.moderator, 'ACCEPTED', [[3, 40, 40, null]]],
  [
    7,
    4,
    Personas.giver,
    'ACCEPTED',
    [
      [6, 30, 30, null],
      [7, 20, 20, null],
    ],
  ],
];

/** [delivery n, contribution n, trạng thái, thực nhận theo từng dòng]. */
const Deliveries: ReadonlyArray<
  [
    number,
    number,
    'ACCEPTED' | 'COMPLETED' | 'CANCELLED',
    ReadonlyArray<number | null>,
  ]
> = [
  [1, 1, 'COMPLETED', [18, 5]],
  [2, 2, 'ACCEPTED', [null]],
  [3, 6, 'CANCELLED', [null]],
  [4, 7, 'COMPLETED', [30, 20]],
];

export async function seedCharity(ctx: ISeedContext): Promise<void> {
  for (const item of Campaigns) {
    const decided = item.approval !== 'PENDING_APPROVAL';
    await ctx.q(
      `
        INSERT INTO campaigns (
          global_id, title, slug, description, banner_url, badge_name, target_items_count,
          location, location_label, start_time, end_time, is_active, approval_status,
          approval_note, approved_at, approved_by, created_by, campaign_type,
          beneficiary_relation, allow_over_target
        )
        VALUES ($1, $2, $3, $4, $5, 'Trái tim vàng', 0,
                ST_SetSRID(ST_MakePoint(104.9784, 22.8233), 4326)::geography, 'Hà Giang',
                ${item.starts}, ${item.ends}, $6, $7::text, $8,
                CASE WHEN $9 THEN now() - interval '2 days' END,
                CASE WHEN $9 THEN $10::uuid END, $11, $12, $13, $14)
        ON CONFLICT DO NOTHING
      `,
      [
        campaign(item.n),
        item.title,
        item.slug,
        item.description,
        Banner,
        item.active,
        item.approval,
        item.approval === 'REJECTED'
          ? 'Không phải nhu cầu thiết yếu theo quy định F65b'
          : null,
        decided,
        Personas.admin,
        item.organizer,
        item.type,
        item.relation,
        item.overTarget,
      ],
    );
  }

  for (const [n, campaignN, name, unit, target, categoryId] of Needs)
    await ctx.q(
      `
        INSERT INTO campaign_need_items (
          global_id, campaign_id, category_id, item_name, unit, target_quantity,
          allow_alternative, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT DO NOTHING
      `,
      [
        need(n),
        campaign(campaignN),
        categoryId,
        name,
        unit,
        target,
        n === 1,
        n,
      ],
    );

  let itemN = 0;
  const itemIds = new Map<string, string>();
  for (const [n, campaignN, contributor, status, lines] of Contributions) {
    const decidedStatus = [
      'ACCEPTED',
      'PARTIALLY_ACCEPTED',
      'REJECTED',
    ].includes(status);
    const manager = Personas.organizer;
    await ctx.q(
      `
        INSERT INTO campaign_contributions (
          global_id, campaign_id, contributor_id, status, note, contact_note, decided_at,
          decided_by, withdrawn_at, decision_key
        )
        VALUES ($1, $2, $3, $4::text, 'Đồ đã giặt sạch, đóng thùng sẵn.',
                'Gọi trước 30 phút — dữ liệu riêng, không ra đường công khai',
                CASE WHEN $5 THEN now() - interval '6 days' END,
                CASE WHEN $5 THEN $6::uuid END,
                CASE WHEN $4::text = 'WITHDRAWN' THEN now() - interval '4 days' END,
                CASE WHEN $5 THEN 'seed-decision-' || $7::text END)
        ON CONFLICT DO NOTHING
      `,
      [
        contribution(n),
        campaign(campaignN),
        contributor,
        status,
        decidedStatus,
        manager,
        String(n),
      ],
    );
    for (const [needN, offered, accepted, reason] of lines) {
      itemN += 1;
      itemIds.set(`${n}:${needN}`, contributionItem(itemN));
      await ctx.q(
        `
          INSERT INTO campaign_contribution_items (
            global_id, contribution_id, need_item_id, offered_quantity, condition_note,
            accepted_quantity, rejection_reason
          )
          VALUES ($1, $2, $3, $4, 'Còn tốt', $5, $6)
          ON CONFLICT DO NOTHING
        `,
        [
          contributionItem(itemN),
          contribution(n),
          need(needN),
          offered,
          accepted,
          reason,
        ],
      );
    }
  }

  for (const [n, contributionN, status, received] of Deliveries) {
    const [, campaignN, contributor, , lines] = Contributions.find(
      ([id]) => id === contributionN,
    )!;
    await ctx.q(
      `
        INSERT INTO campaign_deliveries (
          global_id, campaign_id, contribution_id, contributor_id, organizer_id, status,
          completed_at, completed_by, cancelled_at, cancelled_by, cancel_reason
        )
        VALUES ($1, $2, $3, $4, $5, $6::text,
                CASE WHEN $6::text = 'COMPLETED' THEN now() - interval '3 days' END,
                CASE WHEN $6::text = 'COMPLETED' THEN $5::uuid END,
                CASE WHEN $6::text = 'CANCELLED' THEN now() - interval '2 days' END,
                CASE WHEN $6::text = 'CANCELLED' THEN $5::uuid END,
                CASE WHEN $6::text = 'CANCELLED' THEN 'Người góp không liên lạc được sau ba lần gọi' END)
        ON CONFLICT DO NOTHING
      `,
      [
        delivery(n),
        campaign(campaignN),
        contribution(contributionN),
        contributor,
        Personas.organizer,
        status,
      ],
    );
    for (const [index, [needN, , accepted]] of lines.entries())
      await ctx.q(
        `
          INSERT INTO campaign_delivery_items
            (delivery_id, contribution_item_id, need_item_id, accepted_quantity, received_quantity)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT DO NOTHING
        `,
        [
          delivery(n),
          itemIds.get(`${contributionN}:${needN}`),
          need(needN),
          accepted,
          received[index],
        ],
      );
  }

  // Đóng góp ngoài hệ thống: một dòng đang hiệu lực, và một lần SỬA (dòng cũ VOIDED,
  // dòng mới trỏ `replaces_id` về nó). Bảng bất biến — sửa là chèn, không UPDATE.
  const external = (n: number) => seedId(SeedDomains.externalContributions, n);
  for (const [n, needN, quantity, label, status, replaces] of [
    [1, 2, 10, 'Hội phụ nữ phường Dịch Vọng', 'ACTIVE', null],
    [2, 1, 15, 'Công ty may Việt Tiến', 'VOIDED', null],
    [3, 1, 25, 'Công ty may Việt Tiến', 'ACTIVE', 2],
  ] as const)
    await ctx.q(
      `
        INSERT INTO campaign_external_contributions (
          global_id, campaign_id, need_item_id, quantity, source_label, received_at,
          evidence_note, recorded_by, status, replaces_id, voided_at, voided_by, void_reason
        )
        VALUES ($1, $2, $3, $4, $5, now() - interval '4 days', 'Biên bản bàn giao giấy',
                $6, $7::text, $8,
                CASE WHEN $7::text = 'VOIDED' THEN now() - interval '3 days' END,
                CASE WHEN $7::text = 'VOIDED' THEN $6::uuid END,
                CASE WHEN $7::text = 'VOIDED' THEN 'Ghi nhầm số lượng, đã sửa' END)
        ON CONFLICT DO NOTHING
      `,
      [
        external(n),
        campaign(1),
        need(needN),
        quantity,
        label,
        Personas.organizer,
        status,
        replaces === null ? null : external(replaces),
      ],
    );

  // Điều phối viên: một người đang có quyền, một người đã bị thu hồi.
  for (const [userId, revoked] of [
    [Personas.coordinator, false],
    [Personas.giver2, true],
  ] as const)
    await ctx.q(
      `
        INSERT INTO campaign_coordinators (campaign_id, user_id, granted_by, granted_at, revoked_at, revoked_by)
        SELECT $1, $2, $3, now() - interval '10 days',
               CASE WHEN $4 THEN now() - interval '2 days' END,
               CASE WHEN $4 THEN $3::uuid END
        WHERE NOT EXISTS (
          SELECT 1 FROM campaign_coordinators WHERE campaign_id = $1 AND user_id = $2
        )
      `,
      [campaign(1), userId, Personas.organizer, revoked],
    );

  // Người thụ hưởng — RIÊNG TƯ. Hoạt động 2 chưa đồng ý (chờ duyệt), 5 đã rút (đình chỉ).
  for (const [campaignN, fullName, consent, organizer] of [
    [2, 'Nguyễn Thị B', 'PENDING', Personas.giver2],
    [5, 'Trần Văn C', 'PENDING', Personas.coordinator],
  ] as const)
    await ctx.q(
      `
        INSERT INTO campaign_beneficiaries (
          campaign_id, full_name, relation_note, phone, address, consent_status,
          verification_note, updated_by
        )
        VALUES ($1, $2, 'Hàng xóm, sống một mình', '0912000111', 'Hẻm 12, Quận 8',
                $3, 'Đã gặp trực tiếp, có xác nhận của tổ dân phố', $4)
        ON CONFLICT (campaign_id) DO NOTHING
      `,
      [campaign(campaignN), fullName, consent, organizer],
    );

  await ctx.q(
    `
      INSERT INTO campaign_schedule_changes (campaign_id, previous_end_time, new_end_time, changed_by, reason)
      SELECT c.global_id, c.end_time - interval '7 days', c.end_time, $2,
             'Gia hạn một tuần vì mưa lũ làm chậm vận chuyển'
      FROM campaigns c WHERE c.global_id = $1
        AND NOT EXISTS (SELECT 1 FROM campaign_schedule_changes WHERE campaign_id = $1)
    `,
    [campaign(4), Personas.organizer],
  );

  for (const [n, userId, status] of [
    [1, Personas.giver, 'REGISTERED'],
    [2, Personas.receiver, 'REGISTERED'],
    [3, Personas.giver2, 'CANCELLED'],
  ] as const)
    await ctx.q(
      `
        INSERT INTO campaign_participations (global_id, campaign_id, user_id, status, cancelled_at)
        VALUES ($1, $2, $3, $4::text, CASE WHEN $4::text = 'CANCELLED' THEN now() - interval '20 days' END)
        ON CONFLICT DO NOTHING
      `,
      [seedId(SeedDomains.participations, n), campaign(4), userId, status],
    );

  for (const [n, reviewer, reviewee, role, rating, text] of [
    [
      1,
      Personas.organizer,
      Personas.giver,
      'ORGANIZER',
      5,
      'Đến sớm phụ dựng sân khấu.',
    ],
    [
      2,
      Personas.giver,
      Personas.organizer,
      'PARTICIPANT',
      5,
      'Tổ chức chu đáo.',
    ],
    [3, Personas.receiver, Personas.organizer, 'PARTICIPANT', 4, null],
  ] as const)
    await ctx.q(
      `
        INSERT INTO campaign_reviews (global_id, campaign_id, reviewer_id, reviewee_id, reviewer_role, rating, comment)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT DO NOTHING
      `,
      [
        seedId(SeedDomains.campaignReviews, n),
        campaign(4),
        reviewer,
        reviewee,
        role,
        rating,
        text,
      ],
    );

  await reconcileCharityProjections(ctx);
}

/**
 * Projection của nhu cầu theo đúng vòng đời repository:
 *
 * - `accepted_quantity` = phần đã chấp nhận của lượt giao nhận CÒN MỞ (ACCEPTED). Hoàn
 *   tất thì phần đó rời khỏi đây; huỷ thì cũng rời — nó trở về phần còn thiếu.
 * - `received_quantity` = thực nhận của lượt giao nhận COMPLETED + đóng góp ngoài ACTIVE.
 *
 * `current_items_count` của hoạt động là số Admin tự cập nhật; seed đặt bằng tổng thực
 * nhận cho khớp mắt, `target_items_count` bằng tổng mục tiêu.
 */
async function reconcileCharityProjections(ctx: ISeedContext): Promise<void> {
  const campaignIds = Campaigns.map((item) => campaign(item.n));
  await ctx.q(
    `
      UPDATE campaign_need_items n SET
        accepted_quantity = COALESCE((
          SELECT sum(di.accepted_quantity) FROM campaign_delivery_items di
          JOIN campaign_deliveries d ON d.global_id = di.delivery_id
          WHERE di.need_item_id = n.global_id AND d.status = 'ACCEPTED'
        ), 0),
        received_quantity = COALESCE((
          SELECT sum(di.received_quantity) FROM campaign_delivery_items di
          JOIN campaign_deliveries d ON d.global_id = di.delivery_id
          WHERE di.need_item_id = n.global_id AND d.status = 'COMPLETED'
        ), 0) + COALESCE((
          SELECT sum(e.quantity) FROM campaign_external_contributions e
          WHERE e.need_item_id = n.global_id AND e.status = 'ACTIVE'
        ), 0)
      WHERE n.campaign_id = ANY($1::uuid[])
    `,
    [campaignIds],
  );
  await ctx.q(
    `
      UPDATE campaigns c SET
        target_items_count = (SELECT COALESCE(sum(target_quantity), 0) FROM campaign_need_items WHERE campaign_id = c.global_id),
        current_items_count = (SELECT COALESCE(sum(received_quantity), 0) FROM campaign_need_items WHERE campaign_id = c.global_id)
      WHERE c.global_id = ANY($1::uuid[])
    `,
    [campaignIds],
  );
}
