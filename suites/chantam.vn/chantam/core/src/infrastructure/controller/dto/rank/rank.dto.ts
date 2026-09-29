import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  IGetOwnRankSummaryResponseDto,
  IRankMaintenanceCycleDto,
  IRankNextProgressDto,
  IRankSummaryDto,
  RankMaintenanceCycleStatuses,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RankNextProgressDto implements IRankNextProgressDto {
  @ApiProperty({ enum: UserRanks })
  rank: UserRanks;

  @ApiProperty({ example: 672 })
  requiredPoints: number;

  @ApiProperty({ example: 448 })
  remainingPoints: number;

  @ApiProperty({ example: 1 })
  requiredGifts: number;

  @ApiProperty({ example: 1 })
  requiredReferrals: number;

  @ApiProperty({ example: 1 })
  qualifiedReferrals: number;
}

export class RankMaintenanceCycleDto implements IRankMaintenanceCycleDto {
  @ApiProperty({ enum: UserRanks })
  rank: UserRanks;

  @ApiProperty({ type: String, format: 'date-time' })
  cycleStart: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  cycleEnd: Date;

  @ApiProperty({ example: 2 })
  giftsDone: number;

  @ApiProperty({ example: 1 })
  referralsDone: number;

  @ApiProperty({ enum: ['OPEN', 'UNEVALUATED', 'SATISFIED', 'FAILED'] })
  status: RankMaintenanceCycleStatuses;
}

export class RankSummaryDto implements IRankSummaryDto {
  @ApiProperty({ enum: UserRanks })
  rank: UserRanks;

  @ApiProperty({
    example: 448,
    description:
      'Tổng điểm từng kiếm được. Số thống kê, KHÔNG phải căn cứ xét hạng.',
  })
  lifetimePoints: number;

  @ApiProperty({
    example: 700,
    description: 'Điểm đang có — số tiêu được.',
  })
  balancePoints: number;

  @ApiProperty({
    example: 700,
    description:
      'Con số THẬT SỰ quyết định hạng. Bằng `balancePoints` với cấu hình mặc định, bằng `lifetimePoints` khi Admin chuyển `rank.points_source` sang LIFETIME. So với `thresholdPoints`/`warningPoints` thì đọc field NÀY — đọc `balancePoints` là đúng hôm nay và sai ngay lần cấu hình đổi.',
  })
  rankPoints: number;

  @ApiProperty({
    enum: ['BALANCE', 'LIFETIME'],
    description: 'Cột đang cầm quyền quyết hạng, để client khỏi tự đoán.',
  })
  rankPointsSource: 'BALANCE' | 'LIFETIME';

  @ApiProperty({
    example: 672,
    description: 'Ngưỡng bậc đang giữ. Rơi dưới mốc này là tụt hạng.',
  })
  thresholdPoints: number;

  @ApiProperty({
    example: 470,
    description: 'Mốc cảnh báo sắp tụt hạng của bậc đang giữ.',
  })
  warningPoints: number;

  @ApiProperty({
    example: false,
    description: 'true khi điểm đang có đã xuống dưới mốc cảnh báo.',
  })
  demotionWarning: boolean;

  @ApiProperty({ example: 3 })
  postQuota: number;

  @ApiPropertyOptional({ type: () => RankNextProgressDto, nullable: true })
  nextRank: IRankNextProgressDto | null;

  @ApiPropertyOptional({ type: () => RankMaintenanceCycleDto, nullable: true })
  maintenanceCycle: IRankMaintenanceCycleDto | null;
}

export class EvaluateDueRankMaintenanceResponseDto {
  @ApiProperty({ example: 4 })
  processedCycles: number;
}

export class GetOwnRankSummaryResponseDto implements IGetOwnRankSummaryResponseDto {
  @ApiProperty({ type: () => RankSummaryDto })
  rank: IRankSummaryDto;
}
