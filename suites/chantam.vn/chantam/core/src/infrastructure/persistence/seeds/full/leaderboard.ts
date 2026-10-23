import {
  addMonths,
  monthBoundsUtc,
  previousMonth,
  vietnamMonthOf,
} from '@chantam.vn/chantam.core-lib/consts';
import { ISeedContext, Personas } from './seed-context';

/**
 * Bảng thành tích tháng: một tháng ĐÃ CHỐT (tháng trước lúc seed lần đầu) cho cả ba bảng,
 * huy hiệu top 3, và một lượt loại ở tháng đang chạy.
 *
 * Neo theo lần seed ĐẦU: đã có bản chốt nào là thôi — chạy lại sang tháng khác mà ghi tiếp
 * thì ra hai tháng chốt bằng dữ liệu bịa.
 *
 * Người nhận demo giành hạng 3 bảng Người cho lúc đang ẩn danh: huy hiệu đó chỉ hiện ở
 * `GET /profile/me` của họ, không ở hồ sơ công khai — đúng ca mobile cần thử.
 */
export async function seedLeaderboard(ctx: ISeedContext): Promise<void> {
  // Script kiểm migration theo pha (vd. `test:notification-target`) seed trên schema TRƯỚC
  // migration bảng thành tích. Chưa có bảng thì phần này chưa có gì để seed.
  const [schema] = await ctx.q<{ ready: boolean }>(
    `SELECT to_regclass('public.leaderboard_snapshots') IS NOT NULL AS ready`,
  );
  if (!schema?.ready) return;

  const [seeded] = await ctx.q(`SELECT 1 FROM leaderboard_snapshots LIMIT 1`);
  if (seeded) return;

  const current = vietnamMonthOf(new Date());
  const month = previousMonth(current);
  const { start } = monthBoundsUtc(month);
  const expiresAt = monthBoundsUtc(addMonths(month, 4)).start;
  const reachedAt = (day: number) =>
    new Date(start.getTime() + day * 24 * 60 * 60 * 1000);

  const boards: [string, [string, number, number, boolean][]][] = [
    [
      'GIVERS',
      [
        [Personas.giver, 5, 20, false],
        [Personas.giver2, 2, 12, false],
        [Personas.receiver, 1, 3, true],
      ],
    ],
    ['CHARITY', [[Personas.giver2, 1, 15, false]]],
    ['CONSISTENCY', [[Personas.giver, 12, 25, false]]],
  ];

  for (const [board, rows] of boards) {
    const [snapshot] = await ctx.q<{ id: string }>(
      `INSERT INTO leaderboard_snapshots (month, board, badges_awarded, closed_at)
       VALUES ($1::date, $2, true, $3)
       ON CONFLICT (month, board) DO NOTHING
       RETURNING id::text AS id`,
      [month, board, monthBoundsUtc(current).start],
    );
    if (!snapshot) continue;

    for (const [index, [userId, count, day, anonymous]] of rows.entries()) {
      await ctx.q(
        `INSERT INTO leaderboard_entries
           (snapshot_id, user_id, rank, count, reached_at, is_anonymous)
         VALUES ($1::bigint, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [snapshot.id, userId, index + 1, count, reachedAt(day), anonymous],
      );
      await ctx.q(
        `INSERT INTO user_badges (user_id, board, month, rank, is_anonymous, awarded_at, expires_at)
         VALUES ($1, $2, $3::date, $4, $5, $6, $7)
         ON CONFLICT (user_id, board, month) DO NOTHING`,
        [
          userId,
          board,
          month,
          index + 1,
          anonymous,
          monthBoundsUtc(current).start,
          expiresAt,
        ],
      );
    }
  }

  // Một lượt loại ở tháng đang chạy — để màn Admin có dòng để xem và bỏ.
  await ctx.q(
    `INSERT INTO leaderboard_exclusions (month, board, user_id, reason, created_by)
     SELECT $1::date, 'GIVERS', $2, 'Demo: nghi tự trao qua lại với tài khoản phụ', $3
     WHERE NOT EXISTS (
       SELECT 1 FROM leaderboard_exclusions
       WHERE month = $1::date AND user_id = $2 AND removed_at IS NULL
     )`,
    [current, Personas.suspended, Personas.admin],
  );
}
