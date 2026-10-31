import { ISeedContext, Personas, SeedDomains, seedId } from './seed-context';

/**
 * Chat trực tiếp giữa hai người (`DIRECT_USER`), chặn người dùng, và cài đặt "Cho phép người
 * lạ nhắn tin" (30/10).
 *
 * - Người tặng demo ↔ người nhận demo có một phòng trực tiếp đang nói dở — mobile thử danh
 *   sách phòng có phòng không bài (`postId: null`).
 * - Người tặng thứ hai chặn người mới — thử `GET /me/blocks`, và để người mới thấy lỗi chung
 *   `CHAT_RECIPIENT_UNAVAILABLE` khi mở phòng.
 * - Kiểm toán viên tắt nhận tin người lạ.
 */
export async function seedDirectChat(ctx: ISeedContext): Promise<void> {
  // Script kiểm migration theo pha seed trên schema cũ hơn: chưa có bảng chặn hay giá trị
  // enum thì phần này chưa có gì để seed.
  const [schema] = await ctx.q<{ ready: boolean }>(
    `SELECT to_regclass('public.user_blocks') IS NOT NULL
        AND EXISTS (SELECT 1 FROM pg_enum e
                    JOIN pg_type t ON t.oid = e.enumtypid
                    WHERE t.typname = 'chat_rooms_room_type_enum'
                      AND e.enumlabel = 'DIRECT_USER') AS ready`,
  );
  if (!schema?.ready) return;

  const roomId = seedId(SeedDomains.chatRooms, 900);
  // Lưu theo thứ tự chuẩn hoá như repository: id nhỏ ở `giver_id`.
  await ctx.q(
    `
      INSERT INTO chat_rooms
        (global_id, room_type, transaction_id, post_id, giver_id, receiver_id, created_by,
         status, last_message_at, giver_read_at)
      VALUES ($1, 'DIRECT_USER', NULL, NULL, LEAST($2::uuid, $3::uuid),
              GREATEST($2::uuid, $3::uuid), $2::uuid, 'OPEN',
              now() - interval '2 hours', now() - interval '3 hours')
      ON CONFLICT DO NOTHING
    `,
    [roomId, Personas.receiver, Personas.giver],
  );

  const lines: ReadonlyArray<[string, string, number]> = [
    [
      Personas.receiver,
      'Chào anh, em thấy anh online ở Diễn đàn nên nhắn hỏi thăm.',
      180,
    ],
    [Personas.giver, 'Chào bạn, có gì cứ hỏi nhé.', 150],
    [Personas.receiver, 'Dạ, cuối tuần này chùa có khoá tu không anh?', 120],
  ];
  for (const [offset, [sender, body, minutesAgo]] of lines.entries())
    await ctx.q(
      `
        INSERT INTO chat_messages (global_id, room_id, sender_id, body, media_count, created_at)
        VALUES ($1, $2, $3, $4, 0, now() - make_interval(mins => $5))
        ON CONFLICT DO NOTHING
      `,
      [
        seedId(SeedDomains.chatMessages, 9000 + offset),
        roomId,
        sender,
        body,
        minutesAgo,
      ],
    );

  await ctx.q(
    `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [Personas.giver2, Personas.newcomer],
  );
  await ctx.q(
    `UPDATE users SET allow_stranger_messages = false WHERE global_id = $1`,
    [Personas.auditor],
  );
}
