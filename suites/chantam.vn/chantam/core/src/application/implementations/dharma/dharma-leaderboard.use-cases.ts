import {
  IGetDharmaLeaderboardCommand,
  IGetForumEngagementLeaderboardUseCase,
} from '@/application/contracts/dharma';
import {
  LeaderboardClock,
  LeaderboardClockFn,
} from '@/application/contracts/leaderboard';
import { IDharmaLeaderboardRepository } from '@/domain/ports/repository';
import {
  monthBoundsUtc,
  parseLeaderboardMonth,
  toLeaderboardMonthLabel,
  vietnamMonthOf,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  DharmaLeaderboardPeriods,
  IForumEngagementLeaderboardResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable, Optional } from '@nestjs/common';

const DefaultLimit = 10;
const MaxLimit = 50;

/** Tháng (ngày 1) và khung `[start, end)` của lượt đọc; tháng sai dạng là 400. */
export function resolveDharmaLeaderboardMonth(
  month: string | undefined,
  now: Date,
): { month: string; start: Date; end: Date } {
  const resolved =
    month === undefined ? vietnamMonthOf(now) : parseLeaderboardMonth(month);
  if (!resolved)
    throw new ValidationFailedException(['month: phải có dạng YYYY-MM']);
  return { month: resolved, ...monthBoundsUtc(resolved) };
}

export function clampDharmaLeaderboardLimit(limit: number | undefined): number {
  return Math.min(Math.max(Math.trunc(limit ?? DefaultLimit), 1), MaxLimit);
}

/**
 * Tác giả có chủ đề diễn đàn được tương tác nhiều nhất trong tháng (PR #46 §11).
 *
 * Thay cho đo thời gian dùng diễn đàn: không thu screen view hay thời gian foreground. Tính
 * sống từ bảng nguồn, không snapshot — không có huy hiệu hay phần thưởng nào chốt theo nó.
 *
 * Ẩn danh dùng CHUNG cờ `leaderboard_anonymous` của bảng thành tích tháng: người dùng đã nói
 * "đừng hiện tên tôi trên bảng xếp hạng" một lần, không bắt họ nói lại cho từng bảng.
 */
@Injectable()
export class GetForumEngagementLeaderboardUseCase implements IGetForumEngagementLeaderboardUseCase {
  private readonly now: LeaderboardClockFn;

  public constructor(
    @Inject(IDharmaLeaderboardRepository)
    private readonly repository: IDharmaLeaderboardRepository,
    @Optional() @Inject(LeaderboardClock) clock?: LeaderboardClockFn,
  ) {
    this.now = clock ?? (() => new Date());
  }

  public async handle(
    command: IGetDharmaLeaderboardCommand,
  ): Promise<IForumEngagementLeaderboardResponseDto> {
    const { month, start, end } = resolveDharmaLeaderboardMonth(
      command.month,
      this.now(),
    );
    const rows = await this.repository.rankForumEngagement({
      start,
      end,
      limit: clampDharmaLeaderboardLimit(command.limit),
    });

    return {
      leaderboard: {
        period: DharmaLeaderboardPeriods.MONTH,
        month: toLeaderboardMonthLabel(month),
        entries: rows.map((row) => ({
          position: row.position,
          isAnonymous: row.isAnonymous,
          // Tiêu đề chủ đề dẫn thẳng về người viết, nên ẩn tên mà để chủ đề là chưa ẩn gì.
          author: row.isAnonymous ? null : row.author,
          engagementCount: row.engagementCount,
          threadCount: row.threadCount,
          topThread: row.isAnonymous ? null : row.topThread,
        })),
      },
    };
  }
}
