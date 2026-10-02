import {
  ICheckInHistoryItemDto,
  ICheckInMilestoneDto,
  ICheckInPolicyDto,
  IGetCheckInHistoryResponseDto,
  IGetCheckInPolicyResponseDto,
  IGetCheckInStateResponseDto,
  IPublishCheckInPolicyBodyDto,
  IRecordCheckInResponseDto,
  IRepairCheckInBodyDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  MaxCheckInDailyPoints,
  MaxCheckInMilestoneBonusPoints,
  MaxCheckInMilestoneCount,
  MaxRepairWindowDays,
  MaxTransactionsPerRepair,
} from '@chantam.vn/chantam.core-lib/models';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsDefined,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Mixin } from 'ts-mixer';

export class CheckInMilestoneDto implements ICheckInMilestoneDto {
  @ApiProperty({ example: 7, minimum: 1 })
  @IsInt()
  @Min(1)
  streakDays: number;

  @ApiProperty({
    example: 10,
    minimum: 0,
    maximum: MaxCheckInMilestoneBonusPoints,
  })
  @IsInt()
  @Min(0)
  @Max(MaxCheckInMilestoneBonusPoints)
  bonusPoints: number;
}

export class GetCheckInHistoryQueryDto extends Mixin(PaginationQueryDto) {}

export class CheckInHistoryItemDto implements ICheckInHistoryItemDto {
  @ApiProperty({ example: '2026-10-02' }) date: string;
  @ApiProperty({ enum: ['NORMAL', 'REPAIR'] }) kind: 'NORMAL' | 'REPAIR';
  @ApiProperty({ example: 3 }) streakDay: number;
  @ApiProperty({ example: 2 }) pointsAwarded: number;
  @ApiProperty({ example: 7, nullable: true }) milestoneAwarded: number | null;
  @ApiProperty({ example: false }) canRepair: boolean;
}

export class GetCheckInHistoryResponseDto implements IGetCheckInHistoryResponseDto {
  @ApiProperty({ type: () => [CheckInHistoryItemDto] })
  items: ICheckInHistoryItemDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: unknown;
}

export class RepairProgressDto {
  @ApiProperty({ example: 1 }) credits: number;

  @ApiProperty({
    nullable: true,
    description:
      'Tiến độ nhóm đang tích. `policyVersion` là version ĐÃ GHIM cho nhóm ' +
      'này — đổi ngưỡng giữa kỳ không quy đổi lại tiến độ đã có.',
  })
  transactionProgress: {
    current: number;
    required: number;
    policyVersion: number;
  } | null;
}

export class GetCheckInStateResponseDto implements IGetCheckInStateResponseDto {
  @ApiProperty({ example: true }) enabled: boolean;
  @ApiProperty({ example: 3, nullable: true }) policyVersion: number | null;

  @ApiProperty({
    example: '2026-10-02',
    description:
      'Ngày nghiệp vụ theo giờ Việt Nam. App KHÔNG tự suy từ giờ thiết bị — ' +
      'một người để lệch múi giờ sẽ thấy lịch lệch một ngày.',
  })
  businessDate: string;

  @ApiProperty({ example: 'Asia/Ho_Chi_Minh' }) timezone: string;

  @ApiProperty({ enum: ['NOT_CHECKED_IN', 'NORMAL', 'REPAIR'] })
  todayStatus: 'NOT_CHECKED_IN' | 'NORMAL' | 'REPAIR';

  @ApiProperty({ enum: ['NONE', 'ACTIVE', 'AT_RISK', 'ENDED'] })
  streakStatus: 'NONE' | 'ACTIVE' | 'AT_RISK' | 'ENDED';

  @ApiProperty({ example: 2, description: 'Đoạn liên tiếp đang giữ.' })
  currentStreak: number;

  @ApiProperty({
    example: 5,
    description: 'Chiều dài sẽ có nếu bù hết `pendingGapDates`.',
  })
  recoverableStreak: number;

  @ApiProperty({ example: 12 }) longestStreak: number;

  @ApiProperty({ type: [String], example: ['2026-09-30'] })
  pendingGapDates: string[];

  @ApiProperty({
    type: [String],
    description:
      'Những ngày trong `pendingGapDates` còn trong cửa sổ VÀ còn lượt để bù. ' +
      'App hiện nút bù theo danh sách này, không theo `pendingGapDates`.',
  })
  repairableDates: string[];

  @ApiProperty({ example: 7 }) repairWindowDays: number;

  @ApiProperty({ type: () => CheckInMilestoneDto, nullable: true })
  nextMilestone: ICheckInMilestoneDto | null;

  @ApiProperty({ type: () => [CheckInMilestoneDto] })
  milestones: ICheckInMilestoneDto[];

  @ApiProperty({ example: 2 }) dailyPoints: number;

  @ApiProperty({ type: () => RepairProgressDto })
  repair: RepairProgressDto;
}

export class RecordCheckInResponseDto implements IRecordCheckInResponseDto {
  @ApiProperty({
    example: true,
    description:
      '`false` nghĩa là ngày đó đã có dấu và lượt gọi này KHÔNG ghi gì — ' +
      '`dailyPointsAwarded` khi đó bằng 0, không phải số của lần đầu.',
  })
  applied: boolean;

  @ApiProperty({ example: '2026-10-02' }) date: string;
  @ApiProperty({ enum: ['NORMAL', 'REPAIR'] }) kind: 'NORMAL' | 'REPAIR';
  @ApiProperty({ example: 3 }) streakDay: number;
  @ApiProperty({ example: 3 }) currentStreak: number;
  @ApiProperty({ example: 3 }) recoverableStreak: number;
  @ApiProperty({ type: [String] }) pendingGapDates: string[];

  @ApiProperty({ enum: ['ACTIVE', 'AT_RISK', 'ENDED'] })
  streakStatus: 'ACTIVE' | 'AT_RISK' | 'ENDED';

  @ApiProperty({ example: 2 }) dailyPointsAwarded: number;

  @ApiProperty({
    example: 0,
    description:
      'Cộng THÊM điểm ngày. Ngày bù không nhận điểm ngày nhưng vẫn mở được mốc.',
  })
  milestonePointsAwarded: number;

  @ApiProperty({ type: () => [CheckInMilestoneDto] })
  milestonesAwarded: ICheckInMilestoneDto[];

  @ApiProperty({ example: 1 }) repairCreditsRemaining: number;
  @ApiProperty({ example: 3 }) policyVersion: number;
}

export class RepairCheckInDto {
  @ApiProperty({
    example: '2026-09-30',
    description:
      'Phải là một ngày trong `pendingGapDates` và còn trong cửa sổ bù.',
  })
  @IsString()
  @IsISO8601({ strict: true })
  date: string;
}

export class RepairCheckInBodyDto implements IRepairCheckInBodyDto {
  @ApiProperty({ type: () => RepairCheckInDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => RepairCheckInDto)
  repair: RepairCheckInDto;
}

export class CheckInPolicyDto implements ICheckInPolicyDto {
  @ApiProperty({ example: 3 }) version: number;
  @ApiProperty({ example: false }) enabled: boolean;
  @ApiProperty({ example: 2 }) dailyPoints: number;

  @ApiProperty({ type: () => [CheckInMilestoneDto] })
  milestones: ICheckInMilestoneDto[];

  @ApiProperty({ example: 4 }) transactionsPerRepair: number;
  @ApiProperty({ example: 7 }) repairWindowDays: number;
  @ApiProperty({ type: String, format: 'date-time' }) effectiveAt: Date;
  @ApiProperty() reason: string;
  @ApiProperty({ format: 'uuid', nullable: true }) createdBy: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}

export class GetCheckInPolicyResponseDto implements IGetCheckInPolicyResponseDto {
  @ApiProperty({
    type: () => CheckInPolicyDto,
    nullable: true,
    description: '`null` khi chưa Admin nào publish.',
  })
  active: ICheckInPolicyDto | null;

  @ApiProperty({
    type: () => [CheckInPolicyDto],
    description:
      'Các bản đã publish, mới nhất trước. Trả cùng endpoint vì câu "lúc người ' +
      'này bị từ chối thì ngưỡng là bao nhiêu" cần trả lời được ngay khi có khiếu nại.',
  })
  history: ICheckInPolicyDto[];
}

export class PublishCheckInPolicyDto {
  @ApiPropertyOptional({
    example: 2,
    nullable: true,
    description:
      'Version đang xem. `null` khi chưa có bản nào. Lệch thì bị TỪ CHỐI — hai ' +
      'Admin sửa cùng lúc thì người sau sẽ xoá mất thay đổi của người trước.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number | null;

  @ApiProperty({ example: false })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ example: 2, minimum: 0, maximum: MaxCheckInDailyPoints })
  @IsInt()
  @Min(0)
  @Max(MaxCheckInDailyPoints)
  dailyPoints: number;

  @ApiProperty({
    type: () => [CheckInMilestoneDto],
    maxItems: MaxCheckInMilestoneCount,
  })
  @IsArray()
  @ArrayMaxSize(MaxCheckInMilestoneCount)
  @ValidateNested({ each: true })
  @Type(() => CheckInMilestoneDto)
  milestones: CheckInMilestoneDto[];

  @ApiProperty({ example: 4, minimum: 0, maximum: MaxTransactionsPerRepair })
  @IsInt()
  @Min(0)
  @Max(MaxTransactionsPerRepair)
  transactionsPerRepair: number;

  @ApiProperty({ example: 7, minimum: 0, maximum: MaxRepairWindowDays })
  @IsInt()
  @Min(0)
  @Max(MaxRepairWindowDays)
  repairWindowDays: number;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Bỏ trống thì hiệu lực NGAY.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveAt?: Date;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @Length(1, 500)
  reason: string;
}

export class PublishCheckInPolicyBodyDto implements IPublishCheckInPolicyBodyDto {
  @ApiProperty({ type: () => PublishCheckInPolicyDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PublishCheckInPolicyDto)
  checkInPolicy: PublishCheckInPolicyDto;
}

export class PublishCheckInPolicyResponseDto {
  @ApiProperty({ type: () => CheckInPolicyDto })
  policy: ICheckInPolicyDto;
}
