import {
  ICloseLeaderboardMonthCommand,
  ICloseLeaderboardMonthResult,
  ICloseLeaderboardMonthUseCase,
} from '@/application/contracts/leaderboard';
import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  IAdminConfigRepository,
  ILeaderboardRepository,
} from '@/domain/ports/repository';
import {
  addMonths,
  LeaderboardBoards,
  monthBoundsUtc,
  NotificationTargetTypes,
  NotificationTypes,
  parseLeaderboardMonth,
  previousMonth,
  toLeaderboardMonthLabel,
  vietnamMonthOf,
} from '@chantam.vn/chantam.core-lib/consts';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { readLeaderboardConfig } from './leaderboard-config';

const BoardLabels: Record<LeaderboardBoards, string> = {
  [LeaderboardBoards.GIVERS]: 'Người cho',
  [LeaderboardBoards.CHARITY]: 'Tấm lòng từ thiện',
  [LeaderboardBoards.CONSISTENCY]: 'Chuyên cần',
};

/**
 * Chốt sổ một tháng: ghi bản chốt cố định cho cả ba bảng, trao huy hiệu top N, báo người nhận.
 *
 * Chạy bởi CLI `leaderboard:close-month` lúc 00:05 ngày 1 giờ Việt Nam. Lặp lại an toàn: bản
 * chốt có `UNIQUE (month, board)`, thông báo có khoá chống trùng — chạy lần hai không ghi
 * và không gửi gì.
 *
 * Tính năng TẮT vẫn chốt sổ (không tháng nào nằm `LIVE` mãi), nhưng không trao huy hiệu.
 */
@Injectable()
export class CloseLeaderboardMonthUseCase implements ICloseLeaderboardMonthUseCase {
  private readonly logger = new Logger(CloseLeaderboardMonthUseCase.name);

  public constructor(
    @Inject(ILeaderboardRepository)
    private readonly repository: ILeaderboardRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotification: IDispatchNotificationUseCase,
  ) {}

  public async handle(
    command: ICloseLeaderboardMonthCommand,
  ): Promise<ICloseLeaderboardMonthResult> {
    const now = command.now ?? new Date();
    const current = vietnamMonthOf(now);
    const month =
      command.month === undefined
        ? previousMonth(current)
        : parseLeaderboardMonth(command.month);
    if (!month)
      throw new ValidationFailedException(['month: phải có dạng YYYY-MM']);
    // So chuỗi `YYYY-MM-01` là so tháng. Chốt tháng đang chạy là đóng băng một bảng còn đổi.
    if (month >= current)
      throw new ValidationFailedException([
        'month: chỉ chốt được tháng đã kết thúc',
      ]);

    const config = await readLeaderboardConfig(this.adminConfig);
    // Huy hiệu tháng M hiện đến hết tháng M + N: hết hạn lúc 00:00 ngày 1 tháng M + N + 1.
    const expiresAt = monthBoundsUtc(
      addMonths(month, config.badgeMonths + 1),
    ).start;
    // Chốt bù một tháng cũ mà huy hiệu đã quá hạn: vẫn ghi bản chốt, không trao — trao một
    // huy hiệu đã hết hạn chỉ để gửi một thông báo về thứ không hiện ở đâu.
    const awardBadges =
      config.enabled && config.badgeRanks > 0 && expiresAt > now
        ? { ranks: config.badgeRanks, expiresAt }
        : null;

    const boards: ICloseLeaderboardMonthResult['boards'] = [];
    for (const board of Object.values(LeaderboardBoards)) {
      const rows = await this.repository.computeLive({
        month,
        board,
        minCount: config.minCount[board],
        revealIdentity: true,
      });
      const closed = await this.repository.closeBoard({
        month,
        board,
        rows,
        awardBadges,
      });
      boards.push({
        board,
        created: closed.created,
        entries: closed.created ? rows.length : 0,
        badges: closed.badges.length,
      });

      // SAU commit. Gửi hỏng chỉ mất thông báo, không mất huy hiệu.
      for (const badge of closed.badges)
        await this.announce(month, board, badge.userId, badge.rank);
    }

    return { month: toLeaderboardMonthLabel(month), boards };
  }

  private async announce(
    month: string,
    board: LeaderboardBoards,
    userId: string,
    rank: number,
  ): Promise<void> {
    const label = toLeaderboardMonthLabel(month);
    try {
      await this.dispatchNotification.handle({
        userId,
        type: NotificationTypes.LEADERBOARD_BADGE_AWARDED,
        title: 'Bạn lọt top bảng thành tích tháng',
        body: `Bạn đứng thứ ${rank} bảng ${BoardLabels[board]} tháng ${label.slice(5, 7)}/${label.slice(0, 4)}.`,
        target: { type: NotificationTargetTypes.LEADERBOARD, id: null },
        idempotencyKey: `LEADERBOARD_BADGE:${board}:${label}:${userId}`,
      });
    } catch (error) {
      this.logger.warn(
        `Không gửi được thông báo huy hiệu ${board} ${label} cho ${userId}: ${String(error)}`,
      );
    }
  }
}
