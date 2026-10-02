import {
  IGetCheckInHistoryCommand,
  IGetCheckInHistoryResult,
  IGetCheckInHistoryUseCase,
  IGetCheckInStateCommand,
  IGetCheckInStateResult,
  IGetCheckInStateUseCase,
  IRecordCheckInCommand,
  IRecordCheckInUseCase,
  IRecordCheckInUseCaseResult,
  IRepairCheckInCommand,
  IRepairCheckInUseCase,
} from '@/application/contracts/check-in';
import { CheckInRepairDateInvalidException } from '@/domain/exceptions';
import {
  ICheckInRepository,
  IRecordCheckInResult,
} from '@/domain/ports/repository';
import {
  CheckInTimeZone,
  DefaultCheckInPolicy,
  businessDateOf,
  isBusinessDate,
  isRepairableDate,
  nextCheckInMilestone,
  summarizeCheckInRun,
} from '@chantam.vn/chantam.core-lib/models';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { Inject, Injectable } from '@nestjs/common';

function toResponse(result: IRecordCheckInResult) {
  return {
    applied: result.applied,
    date: result.date,
    kind: result.kind,
    streakDay: result.streakDay,
    currentStreak: result.currentStreak,
    recoverableStreak: result.recoverableStreak,
    pendingGapDates: [...result.pendingGapDates],
    streakStatus: result.runStatus,
    dailyPointsAwarded: result.dailyPointsAwarded,
    milestonePointsAwarded: result.milestonePointsAwarded,
    milestonesAwarded: result.milestones.map((milestone) => ({
      streakDays: milestone.milestoneDays,
      bonusPoints: milestone.bonusPoints,
    })),
    repairCreditsRemaining: result.repairCreditsRemaining,
    policyVersion: result.policyVersion,
  };
}

/**
 * Trạng thái điểm danh của chính người gọi.
 *
 * Đọc được KỂ CẢ khi tính năng đang tắt: lịch sử là dữ liệu của người dùng, và
 * khoá đường đọc khi Admin tắt tính năng sẽ làm họ tưởng mất hết.
 */
@Injectable()
export class GetCheckInStateUseCase implements IGetCheckInStateUseCase {
  public constructor(
    @Inject(ICheckInRepository)
    private readonly checkIns: ICheckInRepository,
  ) {}

  public async handle(
    command: IGetCheckInStateCommand,
  ): Promise<IGetCheckInStateResult> {
    const today = businessDateOf(new Date());
    const revision = await this.checkIns.getActivePolicy();
    const policy = revision?.policy ?? DefaultCheckInPolicy;
    const state = await this.checkIns.readState(command.userId, today);

    const summary = state.run
      ? summarizeCheckInRun({
          startDate: state.run.startDate,
          latestCoveredDate: state.run.latestCoveredDate,
          coveredDates: state.run.coveredDates,
        })
      : { currentStreak: 0, recoverableStreak: 0, pendingGapDates: [] };

    // Ngày bù ĐƯỢC PHÉP, không phải mọi ngày thiếu: lọc theo cửa sổ và theo số
    // lượt còn lại, để app không hiện một nút bấm vào là lỗi.
    const repairableDates =
      state.repairCredits > 0
        ? summary.pendingGapDates.filter((date) =>
            isRepairableDate({
              date,
              today,
              repairWindowDays: policy.repairWindowDays,
            }),
          )
        : [];

    return {
      enabled: policy.enabled,
      policyVersion: revision?.version ?? null,
      businessDate: today,
      timezone: CheckInTimeZone,
      todayStatus: state.todayEntry ? state.todayEntry.kind : 'NOT_CHECKED_IN',
      streakStatus: state.run ? state.run.status : 'NONE',
      currentStreak: summary.currentStreak,
      recoverableStreak: summary.recoverableStreak,
      longestStreak: Math.max(state.longestStreak, summary.currentStreak),
      pendingGapDates: [...summary.pendingGapDates],
      repairableDates: [...repairableDates],
      repairWindowDays: policy.repairWindowDays,
      nextMilestone: nextCheckInMilestone({
        streakLength: summary.currentStreak,
        milestones: policy.milestones,
      }),
      milestones: [...policy.milestones],
      dailyPoints: policy.dailyPoints,
      repair: {
        credits: state.repairCredits,
        transactionProgress: state.cohort
          ? {
              current: state.cohort.currentCount,
              required: state.cohort.requiredTransactions,
              policyVersion: state.cohort.policyVersion,
            }
          : null,
      },
    };
  }
}

@Injectable()
export class GetCheckInHistoryUseCase implements IGetCheckInHistoryUseCase {
  public constructor(
    @Inject(ICheckInRepository)
    private readonly checkIns: ICheckInRepository,
  ) {}

  public async handle(
    command: IGetCheckInHistoryCommand,
  ): Promise<IGetCheckInHistoryResult> {
    const { skip, take } = toSkipTake(command);

    // KHÔNG đọc policy ở đây. Bản đầu có đọc để tính `canRepair`, nhưng danh sách
    // này chỉ chứa những ngày ĐÃ có dấu — không ngày nào trong đó bù được, nên cờ
    // luôn `false` bất kể policy. Giữ lại hai lượt đọc chỉ để rồi bỏ đi là mô tả
    // một phép tính không xảy ra. Những ngày bù được nằm ở `repairableDates` của
    // `GET /check-ins/me`; xem docs/diagram/31-open-items.md về việc ghép hai nguồn.
    const { items, total } = await this.checkIns.listHistory({
      userId: command.userId,
      skip,
      take,
    });

    return {
      items: items.map((item) => ({
        date: item.policyDate,
        kind: item.kind,
        streakDay: item.streakDay,
        pointsAwarded: item.dailyPointsAwarded,
        milestoneAwarded: item.milestoneDaysAwarded,
        // Ngày đã có dấu thì không bù; `canRepair` ở đây luôn `false`. Nó nằm trong
        // response vì app dựng lịch từ danh sách này và cần một cờ cho MỌI ô —
        // những ô còn thiếu nằm ở `pendingGapDates` của `GET /check-ins/me`.
        canRepair: false,
      })),
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}

/**
 * Điểm danh HÔM NAY.
 *
 * Ngày lấy từ giờ server theo múi Việt Nam, KHÔNG nhận từ client: nhận ngày từ
 * client là mời người ta điểm danh cho ngày mai, hoặc lấp ngược quá khứ miễn phí
 * mà không tiêu lượt bù nào.
 */
@Injectable()
export class RecordCheckInUseCase implements IRecordCheckInUseCase {
  public constructor(
    @Inject(ICheckInRepository)
    private readonly checkIns: ICheckInRepository,
  ) {}

  public async handle(
    command: IRecordCheckInCommand,
  ): Promise<IRecordCheckInUseCaseResult> {
    const today = businessDateOf(new Date());
    return toResponse(
      await this.checkIns.record({
        userId: command.userId,
        today,
        date: today,
        kind: 'NORMAL',
      }),
    );
  }
}

/** Bù một ngày đã bỏ lỡ, tiêu một lượt. */
@Injectable()
export class RepairCheckInUseCase implements IRepairCheckInUseCase {
  public constructor(
    @Inject(ICheckInRepository)
    private readonly checkIns: ICheckInRepository,
  ) {}

  public async handle(
    command: IRepairCheckInCommand,
  ): Promise<ReturnType<typeof toResponse>> {
    // Kiểm dạng ngày TRƯỚC khi mở transaction: một chuỗi rác xuống tới SQL sẽ ra
    // lỗi cú pháp Postgres, tức 500 cho một lỗi của client.
    if (!isBusinessDate(command.date))
      throw new CheckInRepairDateInvalidException(0);

    const today = businessDateOf(new Date());
    return toResponse(
      await this.checkIns.record({
        userId: command.userId,
        today,
        date: command.date,
        kind: 'REPAIR',
      }),
    );
  }
}
