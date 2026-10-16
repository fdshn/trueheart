import { ISeedContext, Personas, SeedDomains, seedId } from './seed-context';

const Image = 'https://placehold.co/1200x600.png';

/**
 * Nội dung Admin (blog, banner tài trợ, giao diện trang chủ, thông báo hàng loạt),
 * báo xấu, và hộp thư thông báo.
 *
 * Hai chỗ seed cố ý KHÔNG làm, vì cron thật sẽ cầm lên và chạy:
 *
 * - Không có broadcast `PENDING`/`SENDING`: worker gửi hàng loạt sẽ gửi nó cho MỌI
 *   người dùng trên database đó, không chỉ user demo.
 * - Thông báo đều có `pushed_at`: không để worker đẩy thông báo cũ xuống máy thật.
 */
export async function seedContentAndInbox(ctx: ISeedContext): Promise<void> {
  const blogs: ReadonlyArray<[number, string, string, string, boolean]> = [
    [
      1,
      'Chuyện chiếc xe đạp thứ hai',
      'seed-chuyen-chiec-xe-dap',
      'GUONG_SANG',
      true,
    ],
    [
      2,
      'Áo ấm vùng cao: nhìn lại một mùa đông',
      'seed-ao-am-nhin-lai',
      'CHIEN_DICH',
      true,
    ],
    [
      3,
      'Sống xanh: tái sử dụng đồ cũ trong nhà',
      'seed-song-xanh-tai-su-dung',
      'SONG_XANH',
      true,
    ],
    [
      4,
      'Bản nháp: Tứ diệu đế cho người mới',
      'seed-ban-nhap-tu-dieu-de',
      'PHAT_PHAP',
      false,
    ],
  ];
  for (const [n, title, slug, category, published] of blogs)
    await ctx.q(
      `
        INSERT INTO blogs (global_id, title, slug, category, summary, content_html, thumbnail_url,
                           author_id, view_count, is_published, published_at)
        VALUES ($1, $2::text, $3, $4, left($2::text, 100), '<p>' || $2::text || '</p><p>Nội dung bài viết demo.</p>',
                $5, $6, $7, $8, CASE WHEN $8 THEN now() - interval '7 days' END)
        ON CONFLICT DO NOTHING
      `,
      [
        seedId(SeedDomains.blogs, n),
        title,
        slug,
        category,
        Image,
        Personas.admin,
        published ? 50 * n : 0,
        published,
      ],
    );

  const banners: ReadonlyArray<[number, string, string, string, string]> = [
    [
      1,
      'Siêu thị Xanh',
      'HOME_HERO',
      'APPROVED',
      'https://example.com/sieu-thi-xanh',
    ],
    [2, 'Ngân hàng ABC', 'MERIT_PAGE', 'APPROVED', 'chantam://merit'],
    [
      3,
      'Cửa hàng chờ duyệt',
      'POST_LIST',
      'PENDING_APPROVAL',
      'https://example.com/cho-duyet',
    ],
    [
      4,
      'Quảng cáo bị từ chối',
      'HOME_INLINE',
      'REJECTED',
      'https://example.com/tu-choi',
    ],
  ];
  for (const [n, partner, placement, approval, target] of banners)
    await ctx.q(
      `
        INSERT INTO sponsor_banners (
          global_id, partner_name, partner_contact, title, image_url, target_url, placement,
          display_order, starts_at, ends_at, is_active, approval_status, approval_note,
          approved_at, approved_by, impression_count, click_count, created_by
        )
        VALUES ($1, $2, 'lienhe@example.com', 'Đồng hành cùng Chân Tâm', $3, $4, $5, $6,
                now() - interval '5 days', now() + interval '25 days', true, $7::text,
                CASE WHEN $7::text = 'REJECTED' THEN 'Nội dung quảng cáo không phù hợp' END,
                CASE WHEN $7::text <> 'PENDING_APPROVAL' THEN now() - interval '4 days' END,
                CASE WHEN $7::text <> 'PENDING_APPROVAL' THEN $8::uuid END,
                $9, $10, $8)
        ON CONFLICT DO NOTHING
      `,
      [
        seedId(SeedDomains.banners, n),
        partner,
        Image,
        target,
        placement,
        n,
        approval,
        Personas.admin,
        approval === 'APPROVED' ? 1200 * n : 0,
        approval === 'APPROVED' ? 37 * n : 0,
      ],
    );

  // Thư viện ảnh CMS (A2). Key dưới `seed/` chứ không `users/`: job dọn rác chỉ quét
  // `users/`, và object seed vốn không tồn tại trên bucket.
  const libraryImages: ReadonlyArray<[number, string]> = [
    [1, 'bia-vu-lan-2026.png'],
    [2, 'banner-ao-am-vung-cao.png'],
  ];
  for (const [n, fileName] of libraryImages)
    await ctx.q(
      `
        INSERT INTO media_assets
          (global_id, storage_key, public_url, content_type, file_name, uploaded_by)
        VALUES ($1, $2, $3, 'image/png', $4, $5)
        ON CONFLICT (storage_key) DO NOTHING
      `,
      [
        seedId(SeedDomains.mediaAssets, n),
        `seed/cms-media/${n}.png`,
        Image,
        fileName,
        Personas.admin,
      ],
    );

  // Giao diện trang chủ: một bản nháp tắt, và một bản đang bật — chỉ bật khi database
  // CHƯA có bản nào đang bật, để không đè cấu hình trang chủ thật của môi trường.
  const theme = {
    primaryColor: '#C0392B',
    headerGradient: ['#C0392B', '#F39C12'],
    greetingIcon: '🏮',
  };
  const sections = [
    {
      id: 'hero',
      type: 'HERO_BANNER_SLIDER',
      title: null,
      enabled: true,
      order: 1,
    },
    {
      id: 'urgent',
      type: 'URGENT_CAMPAIGN_ITEMS',
      title: 'Đang cần gấp',
      enabled: true,
      order: 2,
    },
    {
      id: 'nearby',
      type: 'NEARBY_POSTS_GRID',
      title: 'Quanh bạn',
      enabled: true,
      order: 3,
    },
  ];
  const homeBanners = [
    {
      id: 'b1',
      imageUrl: Image,
      title: 'Áo ấm vùng cao',
      ctaText: 'Góp ngay',
      deepLink: 'givingapp://campaigns/seed-ao-am-vung-cao',
    },
  ];
  const [{ active }] = await ctx.q<{ active: number }>(
    `SELECT count(*)::int AS active FROM home_campaign_configs
     WHERE is_active AND end_time > now() AND global_id <> $1`,
    [seedId(SeedDomains.homeCampaigns, 1)],
  );
  for (const [n, name, isActive] of [
    [1, 'Trung thu yêu thương', active === 0],
    [2, 'Bản nháp: Tết sum vầy', false],
  ] as const)
    await ctx.q(
      `
        INSERT INTO home_campaign_configs (
          global_id, campaign_name, theme_config, marquee_text, popup_config, floating_banner,
          banners, sections_order, start_time, end_time, is_active, created_by, updated_by
        )
        VALUES ($1, $2, $3::jsonb, 'Chân Tâm — cho đi là còn mãi', $4::jsonb, $5::jsonb,
                $6::jsonb, $7::jsonb, now() - interval '3 days', now() + interval '27 days',
                $8, $9, $9)
        ON CONFLICT DO NOTHING
      `,
      [
        seedId(SeedDomains.homeCampaigns, n),
        name,
        JSON.stringify(theme),
        JSON.stringify({
          imageUrl: Image,
          deepLink: 'givingapp://campaigns/seed-ao-am-vung-cao',
        }),
        JSON.stringify({
          label: 'Góp áo ấm',
          deepLink: 'givingapp://campaigns/seed-ao-am-vung-cao',
        }),
        JSON.stringify(homeBanners),
        JSON.stringify(sections),
        isActive,
        Personas.admin,
      ],
    );

  for (const [n, audience, status, group] of [
    [1, 'ALL', 'COMPLETED', null],
    [2, 'GROUP', 'FAILED', seedId(SeedDomains.groups, 1)],
    [3, 'AREA', 'COMPLETED', null],
  ] as const)
    await ctx.q(
      `
        INSERT INTO notification_broadcasts (
          global_id, audience_type, group_id, center_location, radius_meters, notification_type,
          title, body, status, audience_count, notified_count, already_sent_count, failed_count,
          last_user_id, failure_reason, created_by, started_at, completed_at
        )
        VALUES ($1, $2::text, $3,
                CASE WHEN $2::text = 'AREA' THEN ST_SetSRID(ST_MakePoint(105.8342, 21.0285), 4326)::geography END,
                CASE WHEN $2::text = 'AREA' THEN 3000 END,
                'SYSTEM_BROADCAST', 'Thông báo demo', 'Chiến dịch Áo ấm vùng cao đã mở nhận đóng góp.',
                $4::text, 120, CASE WHEN $4::text = 'FAILED' THEN 40 ELSE 118 END, 2,
                CASE WHEN $4::text = 'FAILED' THEN 80 ELSE 0 END, 0,
                CASE WHEN $4::text = 'FAILED' THEN 'Nhà cung cấp push trả lỗi 503' END,
                $5, now() - interval '2 days', now() - interval '2 days' + interval '3 minutes')
        ON CONFLICT DO NOTHING
      `,
      [
        seedId(SeedDomains.broadcasts, n),
        audience,
        group,
        status,
        Personas.admin,
      ],
    );

  const reports: ReadonlyArray<
    [number, string, string, string, string, string]
  > = [
    [
      1,
      Personas.receiver,
      'POST',
      seedId(SeedDomains.posts, 7),
      'PROHIBITED_ITEM',
      'RESOLVED',
    ],
    [2, Personas.giver, 'USER', Personas.suspended, 'SCAM', 'PENDING'],
    [
      3,
      Personas.coordinator,
      'COMMENT',
      seedId(SeedDomains.comments, 4),
      'SCAM',
      'IN_REVIEW',
    ],
    [
      4,
      Personas.giver2,
      'POST',
      seedId(SeedDomains.posts, 10),
      'MISLEADING',
      'DISMISSED',
    ],
    // Báo người tặng đòi tiền cọc trong phòng chat 1 — báo xấu ĐANG MỞ trỏ vào một người
    // trong phòng là điều kiện để Admin được mở phòng đó điều tra.
    [5, Personas.receiver, 'USER', Personas.giver2, 'SCAM', 'PENDING'],
  ];
  for (const [n, reporter, type, target, reason, status] of reports) {
    const reviewed = status === 'RESOLVED' || status === 'DISMISSED';
    await ctx.q(
      `
        INSERT INTO reports (
          global_id, reporter_user_id, target_type, target_id, reason, description,
          evidence_urls, status, reviewed_by_user_id, review_note, reviewed_at
        )
        VALUES ($1, $2, $3::reports_target_type_enum, $4, $5::reports_reason_enum,
                'Báo xấu demo để test hàng đợi Admin.', '[]'::jsonb, $6::reports_status_enum,
                $7::uuid, $8, CASE WHEN $7::uuid IS NULL THEN NULL ELSE now() - interval '1 day' END)
        ON CONFLICT DO NOTHING
      `,
      [
        seedId(SeedDomains.reports, n),
        reporter,
        type,
        target,
        reason,
        status,
        reviewed ? Personas.moderator : null,
        reviewed
          ? status === 'RESOLVED'
            ? 'Đã gỡ bài vi phạm'
            : 'Không đủ căn cứ'
          : null,
      ],
    );
  }

  const tx = (n: number) => seedId(SeedDomains.transactions, n);
  const notifications: ReadonlyArray<
    [number, string, string, string, string, string, string, boolean]
  > = [
    [
      1,
      Personas.giver2,
      'GIFT_REQUEST_CREATED',
      'Có người xin nhận quà',
      'Trần Bình muốn nhận "Nồi cơm điện Sharp 1.8L".',
      'POST',
      seedId(SeedDomains.posts, 1),
      true,
    ],
    [
      2,
      Personas.receiver,
      'GIFT_REQUEST_ACCEPTED',
      'Bạn được chọn nhận quà',
      'Hẹn người tặng để lấy "Nồi cơm điện Sharp 1.8L".',
      'GIFT_TRANSACTION',
      tx(1),
      false,
    ],
    [
      3,
      Personas.receiver,
      'NEW_CHAT_MESSAGE',
      'Tin nhắn mới',
      'Được bạn nhé, tới nơi gọi mình.',
      'CHAT_ROOM',
      seedId(SeedDomains.chatRooms, 1),
      false,
    ],
    [
      4,
      Personas.giver,
      'CHARITY_CONTRIBUTION_DECIDED',
      'Đề nghị đóng góp đã được duyệt',
      'Áo ấm cho học sinh vùng cao đã nhận đề nghị của bạn.',
      'CHARITY_CONTRIBUTION',
      seedId(SeedDomains.contributions, 1),
      true,
    ],
    [
      5,
      Personas.organizer,
      'CHARITY_CONTRIBUTION_SUBMITTED',
      'Có đề nghị đóng góp mới',
      'Đỗ Minh đề nghị góp 30 cuốn vở.',
      'CHARITY_CONTRIBUTION',
      seedId(SeedDomains.contributions, 3),
      false,
    ],
  ];
  for (const [
    n,
    userId,
    type,
    title,
    body,
    refType,
    refId,
    read,
  ] of notifications)
    await ctx.q(
      `
        INSERT INTO notifications (global_id, user_id, type, title, body, reference_type, reference_id,
                                   idempotency_key, read_at, pushed_at, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $9 THEN now() - interval '1 hour' END,
                now() - interval '2 hours', now() - interval '2 hours')
        ON CONFLICT DO NOTHING
      `,
      [
        seedId(SeedDomains.notifications, n),
        userId,
        type,
        title,
        body,
        refType,
        refId,
        `SEED:${n}`,
        read,
      ],
    );
}
