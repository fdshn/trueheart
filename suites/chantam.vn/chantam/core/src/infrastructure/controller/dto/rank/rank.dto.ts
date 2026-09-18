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

  @ApiProperty({ example: 448 })
  lifetimePoints: number;

  @ApiProperty({ example: 3 })
  postQuota: number;

  @ApiPropertyOptional({ type: () => RankNextProgressDto, nullable: true })
  nextRank: IRankNextProgressDto | null;

  @ApiPropertyOptional({ type: () => RankMaintenanceCycleDto, nullable: true })
  maintenanceCycle: IRankMaintenanceCycleDto | null;
}

export class GetOwnRankSummaryResponseDto implements IGetOwnRankSummaryResponseDto {
  @ApiProperty({ type: () => RankSummaryDto })
  rank: IRankSummaryDto;
}
