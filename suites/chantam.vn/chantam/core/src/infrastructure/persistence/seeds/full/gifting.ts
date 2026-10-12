import { TransactionReviewRoles } from '@chantam.vn/chantam.core-lib/models';
import {
  Categories,
  ISeedContext,
  Personas,
  SeedDomains,
  seedId,
} from './seed-context';

const post = (n: number) => seedId(SeedDomains.posts, n);
const tx = (n: number) => seedId(SeedDomains.transactions, n);
const room = (n: number) => seedId(SeedDomains.chatRooms, n);
const message = (n: number) => seedId(SeedDomains.chatMessages, n);

interface ISeedPost {
  id: string;
  authorId: string;
  type: 'OFFER' | 'WANTED' | 'CHARITY' | 'CLASSIFIED' | 'MERIT';
  status: string;
  title: string;
  description: string;
  categoryId: string;
  area: string;
  lng: number;
  lat: number;
  total?: number;
  remaining?: number;
  details?: Record<string, unknown>;
  /** Biểu thức SQL, không phải tham số — để thời điểm luôn tương đối với lúc seed. */
  expiresAt?: string;
  isSos?: boolean;
  delivery?: 'SELF_PICKUP' | 'GIVER_SHIPS';
  shipPayer?: 'GIVER' | 'RECEIVER';
  selection?: 'INSTANT' | 'OPTIMAL';
  charityTransfer?: boolean;
  media?: number;
}

/**
 * Bài đăng phủ đủ MỌI trạng thái của `gift_posts_status_enum`, cùng các cờ hay bị bỏ
 * sót khi test bằng tay: SOS, giao tận nơi ai trả ship, nhiều số lượng, chuyển từ thiện.
 */
export const SeedPosts: readonly ISeedPost[] = [
  {
    id: post(1),
    authorId: Personas.giver2,
    type: 'OFFER',
    status: 'RESERVED',
    title: 'Nồi cơm điện Sharp 1.8L',
    description:
      'Nồi cơm điện còn nấu tốt, lòng nồi chống dính hơi trầy. Đã chọn được người nhận, đang hẹn giờ lấy.',
    categoryId: Categories.household,
    area: 'Cầu Giấy, Hà Nội',
    lng: 105.7942,
    lat: 21.0333,
    remaining: 0,
    details: { condition: 'USED', estimatedValue: 400_000 },
    delivery: 'SELF_PICKUP',
    media: 2,
  },
  {
    id: post(2),
    authorId: Personas.giver2,
    type: 'OFFER',
    status: 'DELIVERING',
    title: 'Quạt đứng Senko còn mới',
    description:
      'Quạt đứng ba tốc độ, dùng một mùa hè. Người tặng gửi ship, người nhận trả phí vận chuyển.',
    categoryId: Categories.household,
    area: 'Thanh Xuân, Hà Nội',
    lng: 105.8079,
    lat: 20.9936,
    remaining: 0,
    details: { condition: 'LIKE_NEW', estimatedValue: 350_000 },
    delivery: 'GIVER_SHIPS',
    shipPayer: 'RECEIVER',
    media: 1,
  },
  {
    id: post(3),
    authorId: Personas.giver,
    type: 'OFFER',
    status: 'COMPLETED',
    title: 'Bộ truyện Doraemon 45 tập',
    description:
      'Đủ bộ 45 tập bản cũ, gáy hơi ố nhưng không rách. Đã trao tận tay và hai bên đã đánh giá nhau.',
    categoryId: Categories.books,
    area: 'Hoàn Kiếm, Hà Nội',
    lng: 105.8521,
    lat: 21.0287,
    remaining: 0,
    details: { condition: 'USED', estimatedValue: 600_000 },
    media: 3,
  },
  {
    id: post(4),
    authorId: Personas.giver2,
    type: 'OFFER',
    status: 'COMPLETED',
    title: 'Xe đẩy em bé gấp gọn',
    description:
      'Xe đẩy gấp gọn có mái che, khoá bánh còn tốt. Người nhận đã đánh giá, người tặng CHƯA — để test nhắc đánh giá.',
    categoryId: Categories.vehicles,
    area: 'Tây Hồ, Hà Nội',
    lng: 105.8188,
    lat: 21.0656,
    remaining: 0,
    details: { condition: 'USED', estimatedValue: 900_000 },
  },
  {
    id: post(5),
    authorId: Personas.giver,
    type: 'OFFER',
    status: 'CANCELLED',
    title: 'Tủ lạnh mini 90 lít',
    description:
      'Bài đã huỷ: người tặng chuyển nhà gấp nên không giao được. Giao dịch đi kèm đã đóng có lý do.',
    categoryId: Categories.household,
    area: 'Long Biên, Hà Nội',
    lng: 105.8889,
    lat: 21.0466,
    details: { condition: 'USED', estimatedValue: 1_200_000 },
  },
  {
    id: post(6),
    authorId: Personas.groupOwner,
    type: 'OFFER',
    status: 'PENDING_REVIEW',
    title: 'Máy may Singer đạp chân',
    description:
      'Máy may cơ còn chạy êm, cần người biết dùng. Bài đang chờ kiểm duyệt — test hàng đợi duyệt bài.',
    categoryId: Categories.household,
    area: 'Hà Đông, Hà Nội',
    lng: 105.7739,
    lat: 20.9714,
  },
  {
    id: post(7),
    authorId: Personas.groupOwner,
    type: 'CLASSIFIED',
    status: 'REJECTED',
    title: 'Bán thuốc giảm cân nhập khẩu',
    description:
      'Bài bị từ chối vì là mặt hàng cấm. Dùng để test hiển thị lý do từ chối cho tác giả.',
    categoryId: Categories.medical,
    area: 'Hà Đông, Hà Nội',
    lng: 105.775,
    lat: 20.972,
  },
  {
    id: post(8),
    authorId: Personas.groupOwner,
    type: 'OFFER',
    status: 'DRAFT',
    title: 'Bản nháp: chăn bông mùa đông',
    description:
      'Bản nháp chưa đăng — chỉ tác giả thấy. Test danh sách bài của tôi lọc theo trạng thái.',
    categoryId: Categories.clothes,
    area: 'Hà Đông, Hà Nội',
    lng: 105.776,
    lat: 20.973,
  },
  {
    id: post(9),
    authorId: Personas.giver2,
    type: 'OFFER',
    status: 'EXPIRED',
    title: 'Giày thể thao size 40',
    description:
      'Bài đã hết hạn sau 30 ngày không ai nhận. Test luồng gia hạn bài (renew).',
    categoryId: Categories.clothes,
    area: 'Đống Đa, Hà Nội',
    lng: 105.8237,
    lat: 21.0136,
    expiresAt: `now() - interval '2 days'`,
  },
  {
    id: post(10),
    authorId: Personas.coordinator,
    type: 'WANTED',
    status: 'PUBLISHED',
    title: 'Cần gấp xe lăn cho bà cụ sau mổ',
    description:
      'Bà cụ 78 tuổi vừa mổ khớp háng, cần mượn hoặc xin xe lăn trong tháng này. Bài SOS.',
    categoryId: Categories.medical,
    area: 'Hai Bà Trưng, Hà Nội',
    lng: 105.8502,
    lat: 21.0058,
    isSos: true,
  },
  {
    id: post(11),
    authorId: Personas.giver2,
    type: 'OFFER',
    status: 'PUBLISHED',
    title: 'Ba thùng quần áo trẻ em 2-5 tuổi',
    description:
      'Quần áo trẻ em đã giặt sạch, gấp gọn. Người tặng đã xin chuyển cho hoạt động từ thiện — chờ duyệt.',
    categoryId: Categories.clothes,
    area: 'Hoàng Mai, Hà Nội',
    lng: 105.8635,
    lat: 20.9813,
    total: 3,
    remaining: 3,
    charityTransfer: true,
  },
  {
    id: post(12),
    authorId: Personas.groupOwner,
    type: 'OFFER',
    status: 'PUBLISHED',
    title: 'Năm bộ bàn ghế học sinh',
    description:
      'Năm bộ bàn ghế gỗ, đã tặng một bộ. Chọn người nhận theo thứ tự đăng ký (INSTANT). Có hàng chờ.',
    categoryId: Categories.furniture,
    area: 'Hà Đông, Hà Nội',
    lng: 105.7781,
    lat: 20.9745,
    total: 5,
    remaining: 4,
    selection: 'INSTANT',
    media: 3,
  },
  {
    id: post(13),
    authorId: Personas.giver,
    type: 'OFFER',
    status: 'ARCHIVED',
    title: 'Đèn bàn học cũ',
    description: 'Bài đã lưu trữ sau khi hoàn tất từ lâu. Test bộ lọc lưu trữ.',
    categoryId: Categories.electronics,
    area: 'Hoàn Kiếm, Hà Nội',
    lng: 105.85,
    lat: 21.03,
  },
  {
    id: post(14),
    authorId: Personas.giver,
    type: 'OFFER',
    status: 'COMPLETED',
    title: 'Nồi áp suất Elmich 5L',
    description:
      'Nồi áp suất còn tốt, van xả mới thay. Đã trao xong. Một trong năm lượt giúp người tặng demo ĐỦ mẫu để hiện điểm sao và độ chính xác.',
    categoryId: Categories.household,
    area: 'Hoàn Kiếm, Hà Nội',
    lng: 105.851,
    lat: 21.027,
    remaining: 0,
  },
  {
    id: post(15),
    authorId: Personas.giver,
    type: 'OFFER',
    status: 'COMPLETED',
    title: 'Bộ màu vẽ Pentel 24 màu',
    description:
      'Hộp màu vẽ còn hơn nửa, kèm cọ. Đã trao xong. Một trong năm lượt giúp người tặng demo ĐỦ mẫu để hiện điểm sao và độ chính xác.',
    categoryId: Categories.other,
    area: 'Hoàn Kiếm, Hà Nội',
    lng: 105.853,
    lat: 21.029,
    remaining: 0,
  },
  {
    id: post(16),
    authorId: Personas.giver,
    type: 'OFFER',
    status: 'COMPLETED',
    title: 'Ấm siêu tốc Philips',
    description:
      'Ấm siêu tốc 1.7L, đun sôi nhanh. Đã trao xong. Một trong năm lượt giúp người tặng demo ĐỦ mẫu để hiện điểm sao và độ chính xác.',
    categoryId: Categories.household,
    area: 'Hoàn Kiếm, Hà Nội',
    lng: 105.849,
    lat: 21.026,
    remaining: 0,
  },
  {
    id: post(17),
    authorId: Personas.giver,
    type: 'OFFER',
    status: 'COMPLETED',
    title: 'Balo laptop 15 inch',
    description:
      'Balo chống nước, ngăn laptop có đệm. Đã trao xong. Một trong năm lượt giúp người tặng demo ĐỦ mẫu để hiện điểm sao và độ chính xác.',
    categoryId: Categories.other,
    area: 'Hoàn Kiếm, Hà Nội',
    lng: 105.854,
    lat: 21.031,
    remaining: 0,
  },
];

/** Giao dịch, đúng một cái cho mỗi trạng thái sống được của `gift_transactions`. */
export const SeedTransactions = [
  {
    id: tx(1),
    postId: post(1),
    giver: Personas.giver2,
    receiver: Personas.receiver,
    status: 'ACCEPTED',
  },
  {
    id: tx(2),
    postId: post(2),
    giver: Personas.giver2,
    receiver: Personas.coordinator,
    status: 'DELIVERING',
  },
  {
    id: tx(3),
    postId: post(3),
    giver: Personas.giver,
    receiver: Personas.receiver,
    status: 'COMPLETED',
  },
  {
    id: tx(4),
    postId: post(4),
    giver: Personas.giver2,
    receiver: Personas.coordinator,
    status: 'COMPLETED',
  },
  {
    id: tx(5),
    postId: post(5),
    giver: Personas.giver,
    receiver: Personas.groupOwner,
    status: 'CANCELLED',
  },
  {
    id: tx(6),
    postId: post(12),
    giver: Personas.groupOwner,
    receiver: Personas.receiver,
    status: 'COMPLETED',
  },
  {
    id: tx(7),
    postId: post(14),
    giver: Personas.giver,
    receiver: Personas.coordinator,
    status: 'COMPLETED',
  },
  {
    id: tx(8),
    postId: post(15),
    giver: Personas.giver,
    receiver: Personas.groupOwner,
    status: 'COMPLETED',
  },
  {
    id: tx(9),
    postId: post(16),
    giver: Personas.giver,
    receiver: Personas.organizer,
    status: 'COMPLETED',
  },
  {
    id: tx(10),
    postId: post(17),
    giver: Personas.giver,
    receiver: Personas.giver2,
    status: 'COMPLETED',
  },
] as const;

export async function seedGifting(ctx: ISeedContext): Promise<void> {
  for (const item of SeedPosts) {
    const total = item.total ?? 1;
    await ctx.q(
      `
        INSERT INTO posts (
          global_id, post_type, author_id, category_id, title, description, location,
          area_label, status, total_quantity, remaining_quantity, details, expires_at,
          is_sos, delivery_method, ship_payer, selection_mode,
          charity_transfer_status, charity_transfer_requested_at, charity_transfer_note
        )
        VALUES (
          $1, $2::posts_type_enum, $3, $4, $5, $6,
          ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography,
          $9, $10::gift_posts_status_enum, $11, $12, $13::jsonb,
          ${item.expiresAt ?? `now() + interval '20 days'`},
          $14, $15::posts_delivery_method_enum, $16::posts_ship_payer_enum,
          COALESCE($17::posts_selection_mode_enum, 'OPTIMAL'),
          CASE WHEN $18 THEN 'REQUESTED'::posts_charity_transfer_enum END,
          CASE WHEN $18 THEN now() - interval '1 day' END,
          CASE WHEN $18 THEN 'Chuyển cho chiến dịch Áo ấm vùng cao' END
        )
        -- Upsert như seed demo cũ: bài là dữ liệu của seed, sửa seed thì database đã seed
        -- cũng phải theo. Bộ đếm tương tác không nằm ở đây — feed.ts tính lại chúng.
        ON CONFLICT (global_id) DO UPDATE SET
          post_type = EXCLUDED.post_type,
          author_id = EXCLUDED.author_id,
          category_id = EXCLUDED.category_id,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          location = EXCLUDED.location,
          area_label = EXCLUDED.area_label,
          status = EXCLUDED.status,
          total_quantity = EXCLUDED.total_quantity,
          remaining_quantity = EXCLUDED.remaining_quantity,
          details = EXCLUDED.details,
          expires_at = EXCLUDED.expires_at,
          is_sos = EXCLUDED.is_sos,
          delivery_method = EXCLUDED.delivery_method,
          ship_payer = EXCLUDED.ship_payer,
          selection_mode = EXCLUDED.selection_mode,
          deleted_at = NULL,
          updated_at = now()
      `,
      [
        item.id,
        item.type,
        item.authorId,
        item.categoryId,
        item.title,
        item.description,
        item.lng,
        item.lat,
        item.area,
        item.status,
        total,
        item.remaining ?? total,
        // Bài OFFER thật luôn mang tình trạng + giá trị ước tính; thiếu là mapper tương
        // thích của `GET /gift-posts/nearby` ném lỗi và CẢ danh sách ra 500.
        JSON.stringify(
          item.details ??
            (item.type === 'OFFER'
              ? { condition: 'USED', estimatedValue: 200_000 }
              : {}),
        ),
        item.isSos ?? false,
        item.delivery ?? null,
        item.shipPayer ?? null,
        item.selection ?? null,
        item.charityTransfer ?? false,
      ],
    );

    for (let slot = 0; slot < (item.media ?? 0); slot += 1)
      await ctx.q(
        `
          INSERT INTO post_media (post_id, r2_key, sort_order)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `,
        [
          item.id,
          `users/${item.authorId}/posts/${item.id}/media/${slot + 1}.webp`,
          slot,
        ],
      );
  }

  // Hàng chờ của bài nhiều số lượng: đủ mọi trạng thái xin nhận.
  const queue: ReadonlyArray<[number, string, string, string]> = [
    [
      1,
      Personas.coordinator,
      'PENDING',
      'Lớp học tình thương của em đang thiếu bàn ghế ạ.',
    ],
    [
      2,
      Personas.giver,
      'STANDBY',
      'Xin đăng ký dự phòng nếu bạn trước không nhận.',
    ],
    [3, Personas.organizer, 'REJECTED', 'Cho điểm trường ở Hà Giang.'],
    [4, Personas.giver2, 'WITHDRAWN', 'Mình đã tìm được chỗ khác, xin rút.'],
  ];
  for (const [n, requester, status, text] of queue)
    await ctx.q(
      `
        INSERT INTO gift_requests (global_id, post_id, requester_id, message, status, withdrawn_at)
        VALUES ($1, $2, $3, $4, $5::gift_requests_status_enum,
                CASE WHEN $5::gift_requests_status_enum = 'WITHDRAWN' THEN now() - interval '1 day' END)
        ON CONFLICT DO NOTHING
      `,
      [seedId(SeedDomains.giftRequests, n), post(12), requester, text, status],
    );

  for (const [index, deal] of SeedTransactions.entries()) {
    const n = index + 1;
    await ctx.q(
      `
        INSERT INTO gift_requests (global_id, post_id, requester_id, message, status)
        VALUES ($1, $2, $3, 'Mình xin nhận ạ, cảm ơn bạn nhiều.',
                CASE WHEN $4 = 'CANCELLED' THEN 'CANCELLED' ELSE 'ACCEPTED' END::gift_requests_status_enum)
        ON CONFLICT DO NOTHING
      `,
      [
        seedId(SeedDomains.giftRequests, 100 + n),
        deal.postId,
        deal.receiver,
        deal.status,
      ],
    );
    await ctx.q(
      `
        INSERT INTO gift_transactions (
          global_id, post_id, giver_id, receiver_id, status, requested_at, accepted_at,
          handed_over_at, completed_at, closed_at, closed_by, close_reason
        )
        VALUES (
          $1, $2, $3, $4, $5::text, now() - interval '10 days', now() - interval '9 days',
          CASE WHEN $5::text IN ('DELIVERING', 'COMPLETED') THEN now() - interval '6 days' END,
          CASE WHEN $5::text = 'COMPLETED' THEN now() - interval '5 days' END,
          CASE WHEN $5::text = 'CANCELLED' THEN now() - interval '8 days' END,
          CASE WHEN $5::text = 'CANCELLED' THEN $3::uuid END,
          CASE WHEN $5::text = 'CANCELLED' THEN 'Người tặng chuyển nhà gấp' END
        )
        ON CONFLICT (global_id) DO NOTHING
      `,
      [deal.id, deal.postId, deal.giver, deal.receiver, deal.status],
    );

    if (deal.status === 'CANCELLED') continue;

    // Phòng chat chỉ mở khi đã chấp nhận; giao dịch xong thì phòng thành chỉ đọc.
    const readOnly = deal.status === 'COMPLETED';
    await ctx.q(
      `
        INSERT INTO chat_rooms (
          global_id, transaction_id, post_id, giver_id, receiver_id, status, locked_at,
          last_message_at, giver_read_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::chat_rooms_status_enum,
                CASE WHEN $6::chat_rooms_status_enum = 'READ_ONLY' THEN now() - interval '5 days' END,
                now() - interval '6 days', now() - interval '6 days')
        ON CONFLICT DO NOTHING
      `,
      [
        room(n),
        deal.id,
        deal.postId,
        deal.giver,
        deal.receiver,
        readOnly ? 'READ_ONLY' : 'OPEN',
      ],
    );

    const lines: ReadonlyArray<[string, string, number]> = [
      [
        deal.receiver,
        'Chào bạn, chiều nay khoảng 5 giờ mình qua lấy được không?',
        0,
      ],
      [deal.giver, 'Được bạn nhé, tới nơi gọi mình.', 0],
      [deal.receiver, 'Mình tới rồi, ảnh cổng nhà đây.', 1],
    ];
    for (const [offset, [sender, body, media]] of lines.entries()) {
      const messageId = message(n * 10 + offset);
      await ctx.q(
        `
          INSERT INTO chat_messages (global_id, room_id, sender_id, body, media_count, created_at)
          VALUES ($1, $2, $3, $4, $5, now() - interval '7 days' + make_interval(mins => $6))
          ON CONFLICT DO NOTHING
        `,
        [messageId, room(n), sender, body, media, offset * 5],
      );
      if (media > 0)
        await ctx.q(
          `
            INSERT INTO chat_message_media (message_id, room_id, slot, storage_key)
            VALUES ($1, $2, 1, $3)
            ON CONFLICT DO NOTHING
          `,
          [messageId, room(n), `rooms/${room(n)}/messages/${messageId}/1.webp`],
        );
    }
  }

  // Một tin nhắn bị bộ lọc gắn cờ — một cái đã xử lý, một cái còn chờ Admin.
  for (const [n, reviewed] of [
    [1, false],
    [3, true],
  ] as const) {
    const messageId = message(n * 10 + 9);
    await ctx.q(
      `
        INSERT INTO chat_messages (global_id, room_id, sender_id, body, media_count)
        VALUES ($1, $2, $3, 'Chuyển khoản trước cho mình 200k tiền cọc nhé', 0)
        ON CONFLICT DO NOTHING
      `,
      [messageId, room(n), SeedTransactions[n - 1].giver],
    );
    await ctx.q(
      `
        INSERT INTO chat_message_flags (
          global_id, message_id, room_id, sender_id, severity, matched_terms,
          reviewed_at, reviewed_by, action, review_note
        )
        VALUES ($1, $2, $3, $4, 'REVIEW', ARRAY['chuyển khoản trước', 'tiền cọc'],
                CASE WHEN $5 THEN now() - interval '4 days' END,
                CASE WHEN $5 THEN $6::uuid END,
                CASE WHEN $5 THEN 'USER_WARNED'::chat_flag_actions_enum END,
                CASE WHEN $5 THEN 'Đã nhắc: Chân Tâm không thu tiền cọc' END)
        ON CONFLICT DO NOTHING
      `,
      [
        seedId(SeedDomains.chatFlags, n),
        messageId,
        room(n),
        SeedTransactions[n - 1].giver,
        reviewed,
        Personas.moderator,
      ],
    );
  }

  // Ảnh bàn giao và ảnh đã nhận: đủ ba loại bằng chứng.
  const evidence: ReadonlyArray<
    [number, 'HANDOVER' | 'RECEIPT' | 'RETURNED', string]
  > = [
    [2, 'HANDOVER', Personas.giver2],
    [3, 'HANDOVER', Personas.giver],
    [3, 'RECEIPT', Personas.receiver],
    [4, 'HANDOVER', Personas.giver2],
    [4, 'RETURNED', Personas.coordinator],
  ];
  for (const [index, [n, kind, uploader]] of evidence.entries())
    await ctx.q(
      `
        INSERT INTO gift_transaction_evidence
          (global_id, transaction_id, kind, slot, uploaded_by, storage_key)
        VALUES ($1, $2, $3::gift_transaction_evidence_kind_enum, 1, $4, $5)
        ON CONFLICT DO NOTHING
      `,
      [
        seedId(SeedDomains.evidence, index + 1),
        tx(n),
        kind,
        uploader,
        `transactions/${tx(n)}/${kind.toLowerCase()}/1.webp`,
      ],
    );

  // Đánh giá đi qua repository: nó tính lại điểm sao và độ chính xác người tặng.
  const reviews: ReadonlyArray<
    [number, number, 'GIVER' | 'RECEIVER', number, number | null, string | null]
  > = [
    [1, 3, 'RECEIVER', 5, 100, 'Sách đúng như mô tả, bạn tặng rất nhiệt tình.'],
    [2, 3, 'GIVER', 5, null, 'Đến đúng giờ, lịch sự.'],
    [3, 4, 'RECEIVER', 4, 80, 'Xe tốt nhưng một bánh hơi kẹt so với mô tả.'],
    [4, 6, 'RECEIVER', 5, 100, 'Bàn ghế chắc chắn, cảm ơn nhóm.'],
    [5, 6, 'GIVER', 4, null, 'Đến muộn 20 phút nhưng có báo trước.'],
    // Người tặng demo đủ 5 mẫu: điểm sao (ngưỡng 3) và độ chính xác (ngưỡng 5) đều hiện.
    [6, 7, 'RECEIVER', 5, 90, 'Nồi còn rất tốt.'],
    [7, 8, 'RECEIVER', 4, 70, 'Màu ít hơn mô tả một chút.'],
    [8, 9, 'RECEIVER', 5, 100, null],
    [9, 10, 'RECEIVER', 5, 95, 'Balo như mới.'],
  ];
  for (const [n, txIndex, role, rating, accuracy, comment] of reviews) {
    const deal = SeedTransactions[txIndex - 1];
    const reviewerId = role === 'RECEIVER' ? deal.receiver : deal.giver;
    if (await ctx.reviews.findByReviewer(deal.id, reviewerId)) continue;
    await ctx.reviews.submitReview({
      globalId: seedId(SeedDomains.reviews, n),
      transactionId: deal.id,
      reviewerId,
      revieweeId: role === 'RECEIVER' ? deal.giver : deal.receiver,
      reviewerRole: TransactionReviewRoles[role],
      rating,
      accuracyPercent: accuracy,
      comment,
    });
  }

  for (const deal of SeedTransactions.filter(
    (one) => one.status === 'COMPLETED',
  )) {
    for (const [userId, ruleCode] of [
      [deal.giver, 'GIFT_COMPLETED_GIVER'],
      [deal.receiver, 'GIFT_COMPLETED_RECEIVER'],
    ] as const)
      await ctx.ledger.appendByRule({
        userId,
        ruleCode,
        referenceType: 'GIFT_TRANSACTION',
        referenceId: deal.id,
        idempotencyKey: `${ruleCode}:${deal.id}`,
        actor: 'SYSTEM',
        source: 'REVIEW',
      });
  }
}
