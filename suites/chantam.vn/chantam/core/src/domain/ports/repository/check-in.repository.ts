import {
  BusinessDate,
  CheckInKind,
  CheckInRunStatus,
  ICheckInPolicy,
} from '@chantam.vn/chantam.core-lib/models';
import { EntityManager } from 'typeorm';

export interface ICheckInPolicyRevision {
  readonly version: number;
  readonly policy: ICheckInPolicy;
  readonly effectiveAt: Date;
  readonly reason: string;
  readonly createdBy: string | null;
  readonly createdAt: Date;
}

export interface IPublishCheckInPolicyParams {
  readonly actorUserId: string;
  /**
   * Version mà Admin ĐANG XEM. Lệch thì từ chối thay vì ghi đè — hai Admin sửa
   * cùng lúc thì người sau sẽ xoá mất thay đổi của người trước mà không ai biết.
   */
  readonly expectedVersion: number | null;
  readonly policy: ICheckInPolicy;
  readonly effectiveAt: Date;
  readonly reason: string;
}

export interface ICheckInEntryRow {
  readonly policyDate: BusinessDate;
  readonly kind: CheckInKind;
  readonly streakDay: number;
  readonly dailyPointsAwarded: number;
  readonly milestoneDaysAwarded: number | null;
  readonly createdAt: Date;
}

export interface ICheckInRunRow {
  readonly id: string;
  readonly startDate: BusinessDate;
  readonly latestCoveredDate: BusinessDate;
  readonly status: CheckInRunStatus;
  readonly coveredDates: readonly BusinessDate[];
  readonly awardedMilestoneDays: readonly number[];
}

export interface ICheckInState {
  /** `null` khi người này chưa từng điểm danh, hoặc chuỗi cũ đã đóng. */
  readonly run: ICheckInRunRow | null;
  readonly todayEntry: ICheckInEntryRow | null;
  readonly longestStreak: number;
  readonly repairCredits: number;
  /** Tiến độ nhóm đang tích. `null` khi chưa có giao dịch nào đủ điều kiện. */
  readonly cohort: {
    readonly currentCount: number;
    readonly requiredTransactions: number;
    readonly policyVersion: number;
  } | null;
}

export interface IRecordCheckInParams {
  readonly userId: string;
  readonly today: BusinessDate;
  /** Với `NORMAL` thì bằng `today`; với `REPAIR` là ngày quá khứ cần bù. */
  readonly date: BusinessDate;
  readonly kind: CheckInKind;
}

export interface IRecordedMilestone {
  readonly milestoneDays: number;
  readonly bonusPoints: number;
}

export interface IRecordCheckInResult {
  /** `false` nghĩa là ngày đó đã có dấu và đây là một lượt gọi lặp. */
  readonly applied: boolean;
  readonly kind: CheckInKind;
  readonly date: BusinessDate;
  readonly streakDay: number;
  readonly currentStreak: number;
  readonly recoverableStreak: number;
  readonly pendingGapDates: readonly BusinessDate[];
  readonly runStatus: CheckInRunStatus;
  readonly dailyPointsAwarded: number;
  readonly milestonePointsAwarded: number;
  readonly milestones: readonly IRecordedMilestone[];
  readonly repairCreditsRemaining: number;
  readonly policyVersion: number;
}

export interface ICheckInRepository {
  /**
   * Bản policy đang hiệu lực: `version` lớn nhất có `effective_at <= now()`.
   *
   * `null` khi chưa Admin nào publish. Đường ghi phải coi đó là **chưa bật** chứ
   * không lùi về một mặc định nào — xem `DefaultCheckInPolicy`.
   */
  getActivePolicy(): Promise<ICheckInPolicyRevision | null>;
  listPolicyHistory(limit: number): Promise<ICheckInPolicyRevision[]>;
  publishPolicy(
    params: IPublishCheckInPolicyParams,
  ): Promise<ICheckInPolicyRevision>;

  readState(userId: string, today: BusinessDate): Promise<ICheckInState>;
  listHistory(params: {
    userId: string;
    skip: number;
    take: number;
  }): Promise<{ items: ICheckInEntryRow[]; total: number }>;

  /**
   * Ghi một dấu điểm danh — thường hoặc bù — trong MỘT transaction.
   *
   * Gộp hai đường vào một hàm vì chúng dùng CHUNG toàn bộ phần khó: khoá theo
   * user, dựng lại chuỗi, xét mốc, ghi `point_ledger`. Tách ra là hai bản sao của
   * cùng một đoạn, và chỗ nào quên một bước thì có lịch đã đánh dấu mà thiếu điểm.
   *
   * Ném khi policy chưa bật/chưa đủ số, khi ngày bù ngoài cửa sổ, hoặc khi không
   * còn lượt bù. Gọi lại cho một ngày đã có dấu thì trả `applied: false` kèm đúng
   * số cũ, KHÔNG cộng điểm lần hai.
   */
  record(params: IRecordCheckInParams): Promise<IRecordCheckInResult>;

  /**
   * Tích tiến độ lượt bù từ một lượt trao vừa `COMPLETED`.
   *
   * Nhận `manager` để chạy TRONG transaction đã mở của đường hoàn tất giao dịch:
   * tích ngoài transaction đó thì một lượt trao commit xong mà tiến độ chưa ghi
   * là mất vĩnh viễn — không ai đi dò lại những giao dịch đã hoàn tất.
   *
   * Tính một lần cho MỖI bên. Lượt hoàn tất lặp lại bị chặn bởi
   * `UQ_repair_transaction_progress_user_tx`, không bởi phép đọc trước.
   */
  accrueFromCompletedTransaction(
    manager: EntityManager,
    params: {
      transactionId: string;
      giverId: string;
      receiverId: string;
    },
  ): Promise<void>;
}

export const ICheckInRepository = Symbol('ICheckInRepository');
