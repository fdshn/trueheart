import { IPaginationQueryDto } from '@chantam/service.common-lib/dto';
import { CheckInKind, CheckInRunStatus, ICheckInMilestone } from '../../models';

export interface ICheckInMilestoneDto extends ICheckInMilestone {}

export interface IRepairProgressDto {
  /** Số lượt bù đang có. */
  credits: number;
  /** Giao dịch đã tích trong nhóm đang mở. `null` khi chưa có nhóm nào. */
  transactionProgress: {
    current: number;
    required: number;
    /** Version policy đã GHIM cho nhóm này, không phải version đang chạy. */
    policyVersion: number;
  } | null;
}

export interface IGetCheckInStateResponseDto {
  /** `false` thì đường ghi trả lỗi, nhưng đường đọc vẫn xem được lịch sử. */
  enabled: boolean;
  /** `null` khi chưa Admin nào publish policy. */
  policyVersion: number | null;
  /** Ngày nghiệp vụ theo giờ Việt Nam, để app không tự suy từ giờ thiết bị. */
  businessDate: string;
  timezone: string;
  /** Hôm nay đã điểm danh chưa, và bằng cách nào. */
  todayStatus: 'NOT_CHECKED_IN' | CheckInKind;
  streakStatus: CheckInRunStatus | 'NONE';
  currentStreak: number;
  /** Chiều dài sẽ có nếu bù hết `pendingGapDates`. */
  recoverableStreak: number;
  longestStreak: number;
  pendingGapDates: string[];
  /** Những ngày trong `pendingGapDates` còn trong cửa sổ và còn lượt để bù. */
  repairableDates: string[];
  repairWindowDays: number;
  nextMilestone: ICheckInMilestoneDto | null;
  milestones: ICheckInMilestoneDto[];
  dailyPoints: number;
  repair: IRepairProgressDto;
}

export interface ICheckInHistoryItemDto {
  date: string;
  kind: CheckInKind;
  streakDay: number;
  pointsAwarded: number;
  /** Mốc đã mở nhờ đúng ngày này, `null` nếu không có. */
  milestoneAwarded: number | null;
  /** Theo policy tại thời điểm ĐỌC. Backend vẫn kiểm lại khi ghi. */
  canRepair: boolean;
}

export interface IGetCheckInHistoryQueryDto extends IPaginationQueryDto {}

export interface IGetCheckInHistoryResponseDto {
  items: ICheckInHistoryItemDto[];
  meta: unknown;
}

export interface IRecordCheckInBodyDto {
  /** Rỗng — ngày lấy từ giờ server, không nhận từ client. */
  checkIn?: Record<string, never>;
}

export interface IRepairCheckInBodyDto {
  repair: {
    /** `YYYY-MM-DD`. Phải là một ngày trong `pendingGapDates`. */
    date: string;
  };
}

export interface IRecordCheckInResponseDto {
  /** `false` nghĩa là ngày đó đã có dấu và lượt gọi này không ghi gì. */
  applied: boolean;
  date: string;
  kind: CheckInKind;
  streakDay: number;
  currentStreak: number;
  recoverableStreak: number;
  pendingGapDates: string[];
  streakStatus: CheckInRunStatus;
  dailyPointsAwarded: number;
  milestonePointsAwarded: number;
  milestonesAwarded: ICheckInMilestoneDto[];
  repairCreditsRemaining: number;
  policyVersion: number;
}

export interface ICheckInPolicyDto {
  version: number;
  enabled: boolean;
  dailyPoints: number;
  milestones: ICheckInMilestoneDto[];
  transactionsPerRepair: number;
  repairWindowDays: number;
  effectiveAt: Date;
  reason: string;
  createdBy: string | null;
  createdAt: Date;
}

export interface IGetCheckInPolicyResponseDto {
  /** `null` khi chưa Admin nào publish. */
  active: ICheckInPolicyDto | null;
  history: ICheckInPolicyDto[];
}

export interface IPublishCheckInPolicyBodyDto {
  checkInPolicy: {
    /**
     * Version đang xem. Bỏ trống hoặc `null` nghĩa là "chưa có bản nào", và lệch
     * với thực tế thì bị từ chối.
     */
    expectedVersion?: number | null;
    enabled: boolean;
    dailyPoints: number;
    milestones: ICheckInMilestoneDto[];
    transactionsPerRepair: number;
    repairWindowDays: number;
    effectiveAt?: Date;
    reason: string;
  };
}

export interface IPublishCheckInPolicyResponseDto {
  policy: ICheckInPolicyDto;
}
