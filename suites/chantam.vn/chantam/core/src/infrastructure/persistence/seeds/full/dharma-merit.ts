import { ISeedContext, Personas, SeedDomains, seedId } from './seed-context';

const content = (n: number) => seedId(SeedDomains.dharmaContents, n);
const thread = (n: number) => seedId(SeedDomains.dharmaThreads, n);
const unit = (n: number) => seedId(SeedDomains.meritUnits, n);

export const SeedDharmaThreadIds = [
  thread(1),
  thread(2),
  thread(3),
  thread(4),
] as const;

const Cover = 'https://placehold.co/800x450.png';

const Contents = [
  {
    n: 1,
    type: 'SUTRA',
    category: 'kinh-tung',
    title: 'Bát Nhã Tâm Kinh',
    slug: 'bat-nha-tam-kinh',
    featured: true,
    published: true,
    audio: true,
    body: 'Quán Tự Tại Bồ Tát hành thâm Bát Nhã Ba La Mật Đa thời, chiếu kiến ngũ uẩn giai không, độ nhất thiết khổ ách...',
  },
  {
    n: 2,
    type: 'SUTRA',
    category: 'kinh-tung',
    title: 'Kinh Phổ Môn',
    slug: 'kinh-pho-mon',
    featured: false,
    published: true,
    audio: false,
    body: 'Nhĩ thời Vô Tận Ý Bồ Tát tức tùng toà khởi, thiên đản hữu kiên, hiệp chưởng hướng Phật...',
  },
  {
    n: 3,
    type: 'INFO',
    category: 'kien-thuc',
    title: 'Ý nghĩa ngày rằm tháng Bảy',
    slug: 'y-nghia-ram-thang-bay',
    featured: false,
    published: true,
    audio: false,
    body: 'Rằm tháng Bảy là ngày Vu Lan báo hiếu, nhắc con cháu nhớ ơn sinh thành và dưỡng dục của cha mẹ.',
  },
  {
    n: 4,
    type: 'TEMPLE_INTRO',
    category: null,
    title: 'Chùa Trấn Quốc',
    slug: 'chua-tran-quoc',
    featured: true,
    published: true,
    audio: false,
    body: 'Ngôi chùa cổ nhất Thăng Long, nằm trên bán đảo phía đông Hồ Tây, có lịch sử gần 1.500 năm.',
  },
  {
    n: 5,
    type: 'INFO',
    category: 'kien-thuc',
    title: 'Bản nháp: Hướng dẫn ngồi thiền',
    slug: 'ban-nhap-huong-dan-ngoi-thien',
    featured: false,
    published: false,
    audio: false,
    body: 'Bản nháp chưa xuất bản — chỉ Admin thấy.',
  },
] as const;

const Threads = [
  {
    n: 1,
    author: Personas.receiver,
    title: 'Tụng kinh buổi sáng giúp mình bớt lo âu',
    status: 'VISIBLE',
    pinned: true,
    locked: false,
    body: 'Mình bắt đầu tụng Bát Nhã mỗi sáng được ba tuần, thấy tâm an hơn hẳn. Mọi người có kinh nghiệm gì chia sẻ thêm không?',
  },
  {
    n: 2,
    author: Personas.giver2,
    title: 'Hỏi về lễ cầu an đầu năm',
    status: 'VISIBLE',
    pinned: false,
    locked: true,
    body: 'Chủ đề đã khoá sau khi được trả lời đầy đủ. Lễ cầu an thường tổ chức vào rằm tháng Giêng.',
  },
  {
    n: 3,
    author: Personas.suspended,
    title: 'Bán bùa hộ mệnh giá rẻ liên hệ',
    status: 'HIDDEN',
    pinned: false,
    locked: false,
    body: 'Chủ đề quảng cáo bị kiểm duyệt ẩn. Dùng để test hàng đợi và ghi chú kiểm duyệt.',
  },
  {
    n: 4,
    author: Personas.newcomer,
    title: 'Người mới nên bắt đầu từ đâu?',
    status: 'PENDING_REVIEW',
    pinned: false,
    locked: false,
    body: 'Mình mới tìm hiểu, chưa biết nên đọc kinh nào trước. Chủ đề đang chờ duyệt vì tài khoản mới.',
  },
] as const;

const Units = [
  {
    n: 1,
    type: 'TEMPLE',
    name: 'Chùa Trấn Quốc',
    slug: 'quy-chua-tran-quoc',
    active: true,
    account: '0011004123456',
    bank: 'Vietcombank',
    bin: '970436',
    purpose:
      'Công đức trùng tu chính điện và duy trì bếp cơm chay cho Phật tử.',
  },
  {
    n: 2,
    type: 'FUND',
    name: 'Quỹ Áo ấm vùng cao',
    slug: 'quy-ao-am-vung-cao',
    active: true,
    account: '19033344455566',
    bank: 'Techcombank',
    bin: '970407',
    purpose:
      'Mua áo ấm, chăn bông cho học sinh các điểm trường vùng cao phía Bắc.',
  },
  {
    n: 3,
    type: 'ORGANIZATION',
    name: 'Nhóm Bữa cơm 0 đồng',
    slug: 'nhom-bua-com-0-dong',
    active: true,
    account: '1234567890',
    bank: 'MB Bank',
    bin: '970422',
    purpose:
      'Nấu và phát cơm miễn phí cho bệnh nhân và người nhà tại các bệnh viện.',
  },
  {
    n: 4,
    type: 'FUND',
    name: 'Quỹ đã ngừng nhận',
    slug: 'quy-da-ngung-nhan',
    active: false,
    account: '9999888877',
    bank: 'BIDV',
    bin: '970418',
    purpose: 'Đơn vị đã ngừng — test lọc đơn vị không còn hoạt động.',
  },
] as const;

/** Dharma Hub (kinh, tụng, hồi hướng, diễn đàn) và công đức (đơn vị, khai báo). */
export async function seedDharmaAndMerit(ctx: ISeedContext): Promise<void> {
  for (const item of Contents)
    await ctx.q(
      `
        INSERT INTO dharma_contents (
          global_id, content_type, category, title, slug, summary, body_text, audio_url,
          cover_url, display_order, is_featured, is_published, published_at, view_count,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, left($6::text, 120), $6::text, $7, $8, $9, $10, $11,
                CASE WHEN $11 THEN now() - interval '15 days' END, $12, $13)
        ON CONFLICT DO NOTHING
      `,
      [
        content(item.n),
        item.type,
        item.category,
        item.title,
        item.slug,
        item.body,
        item.audio ? 'https://cdn.example.com/dharma/bat-nha.mp3' : null,
        Cover,
        item.n,
        item.featured,
        item.published,
        item.published ? 120 - item.n * 10 : 0,
        Personas.admin,
      ],
    );

  // Hai lượt tụng xong và một lượt đang dở (completed_at NULL).
  const recitations: ReadonlyArray<[number, string, number, number | null]> = [
    [1, Personas.receiver, 1, 540],
    [2, Personas.receiver, 2, 1260],
    [3, Personas.giver, 1, null],
  ];
  for (const [n, userId, contentN, seconds] of recitations)
    await ctx.q(
      `
        INSERT INTO dharma_recitations (global_id, content_id, user_id, started_at, completed_at, duration_seconds)
        VALUES ($1, $2, $3, now() - interval '2 days',
                CASE WHEN $4::int IS NULL THEN NULL
                     ELSE now() - interval '2 days' + make_interval(secs => $4::int) END,
                $4::int)
        ON CONFLICT DO NOTHING
      `,
      [
        seedId(SeedDomains.dharmaRecitations, n),
        content(contentN),
        userId,
        seconds,
      ],
    );

  const dedications: ReadonlyArray<
    [number, string, number | null, string | null, string, boolean, boolean]
  > = [
    [
      1,
      Personas.receiver,
      1,
      'Mẹ Nguyễn Thị Hoa',
      'Nguyện hồi hướng công đức cho mẹ sớm khoẻ mạnh, an vui.',
      true,
      false,
    ],
    [
      2,
      Personas.receiver,
      2,
      null,
      'Hồi hướng cho tất cả chúng sinh được bình an.',
      true,
      true,
    ],
    [
      3,
      Personas.giver,
      null,
      'Ông bà nội',
      'Hồi hướng riêng tư, không hiện trên bảng công khai.',
      false,
      false,
    ],
  ];
  for (const [
    n,
    userId,
    recitationN,
    dedicatee,
    text,
    isPublic,
    anonymous,
  ] of dedications)
    await ctx.q(
      `
        INSERT INTO dharma_dedications (global_id, user_id, recitation_id, dedicatee_name, text, is_public, is_anonymous)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT DO NOTHING
      `,
      [
        seedId(SeedDomains.dharmaDedications, n),
        userId,
        recitationN === null
          ? null
          : seedId(SeedDomains.dharmaRecitations, recitationN),
        dedicatee,
        text,
        isPublic,
        anonymous,
      ],
    );

  for (const item of Threads) {
    const moderated = item.status === 'HIDDEN';
    await ctx.q(
      `
        INSERT INTO dharma_threads (
          global_id, author_id, title, body_text, category, status, flagged_terms,
          is_locked, is_pinned, moderated_by, moderated_at, moderation_note
        )
        VALUES ($1, $2, $3, $4, 'hoi-dap', $5, $6, $7, $8,
                $9::uuid, CASE WHEN $9::uuid IS NULL THEN NULL ELSE now() - interval '1 day' END, $10)
        ON CONFLICT DO NOTHING
      `,
      [
        thread(item.n),
        item.author,
        item.title,
        item.body,
        item.status,
        moderated ? 'bùa hộ mệnh' : null,
        item.locked,
        item.pinned,
        moderated ? Personas.moderator : null,
        moderated ? 'Quảng cáo mua bán, ẩn theo quy định diễn đàn' : null,
      ],
    );
  }

  for (const item of Units)
    await ctx.q(
      `
        INSERT INTO merit_units (
          global_id, name, slug, unit_type, purpose, cover_url, address_label, location,
          bank_bin, bank_account_number, bank_account_name, bank_name, display_order,
          is_active, created_by
        )
        VALUES ($1, $2::text, $3, $4, $5, $6, 'Hà Nội',
                ST_SetSRID(ST_MakePoint(105.8366, 21.0478), 4326)::geography,
                $7, $8, upper($2::text), $9, $10, $11, $12)
        ON CONFLICT DO NOTHING
      `,
      [
        unit(item.n),
        item.name,
        item.slug,
        item.type,
        item.purpose,
        Cover,
        item.bin,
        item.account,
        item.bank,
        item.n,
        item.active,
        Personas.admin,
      ],
    );

  const declarations: ReadonlyArray<
    [number, number, string, number, 'INTENDED' | 'COMPLETED', boolean]
  > = [
    [1, 1, Personas.giver, 500_000, 'COMPLETED', false],
    [2, 1, Personas.receiver, 100_000, 'INTENDED', false],
    [3, 2, Personas.giver2, 2_000_000, 'COMPLETED', true],
    [4, 3, Personas.groupOwner, 300_000, 'COMPLETED', false],
  ];
  for (const [n, unitN, userId, amount, status, anonymous] of declarations)
    await ctx.q(
      `
        INSERT INTO merit_declarations (global_id, unit_id, user_id, declared_amount, status, is_anonymous, note, completed_at)
        VALUES ($1, $2, $3, $4, $5::text, $6, 'Khai báo công đức demo',
                CASE WHEN $5::text = 'COMPLETED' THEN now() - interval '3 days' END)
        ON CONFLICT DO NOTHING
      `,
      [
        seedId(SeedDomains.meritDeclarations, n),
        unit(unitN),
        userId,
        amount,
        status,
        anonymous,
      ],
    );
}
