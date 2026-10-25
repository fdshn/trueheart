import { LeaderboardMonthPattern } from '@chantam.vn/chantam.core-lib/consts';
import {
  DharmaLeaderboardPeriods,
  IDharmaLeaderboardQueryDto,
  IForumEngagementEntryDto,
  IForumEngagementLeaderboardDto,
  IForumEngagementLeaderboardResponseDto,
  IRecitationTimeEntryDto,
  IRecitationTimeLeaderboardDto,
  IRecitationTimeLeaderboardResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { PublicAuthorSummaryDto } from '../public-author.dto';

export class DharmaLeaderboardQueryDto implements IDharmaLeaderboardQueryDto {
  @ApiPropertyOptional({
    enum: DharmaLeaderboardPeriods,
    default: DharmaLeaderboardPeriods.MONTH,
  })
  @IsOptional()
  @IsEnum(DharmaLeaderboardPeriods)
  period?: DharmaLeaderboardPeriods;

  @ApiPropertyOptional({
    example: '2026-10',
    description: 'Bỏ trống = tháng hiện tại theo giờ Việt Nam.',
  })
  @IsOptional()
  @Matches(LeaderboardMonthPattern, { message: 'phải có dạng YYYY-MM' })
  month?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class ForumEngagementTopThreadDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() title: string;
  @ApiProperty() engagementCount: number;
}

export class ForumEngagementEntryDto implements IForumEngagementEntryDto {
  @ApiProperty({ example: 1 }) position: number;

  @ApiProperty({
    description:
      'Người bật ẩn danh trên bảng thành tích: `author` và `topThread` đều `null`.',
  })
  isAnonymous: boolean;

  @ApiProperty({ type: () => PublicAuthorSummaryDto, nullable: true })
  author: PublicAuthorSummaryDto | null;

  @ApiProperty({
    description:
      'Cảm xúc + bình luận (kể cả trả lời) người KHÁC để lại trong tháng trên các chủ đề đang hiện.',
  })
  engagementCount: number;

  @ApiProperty({ description: 'Số chủ đề nhận được ít nhất một tương tác.' })
  threadCount: number;

  @ApiProperty({ type: () => ForumEngagementTopThreadDto, nullable: true })
  topThread: ForumEngagementTopThreadDto | null;
}

export class ForumEngagementLeaderboardDto implements IForumEngagementLeaderboardDto {
  @ApiProperty({ enum: DharmaLeaderboardPeriods })
  period: DharmaLeaderboardPeriods;

  @ApiProperty({ example: '2026-10' }) month: string;

  @ApiProperty({ type: () => [ForumEngagementEntryDto] })
  entries: ForumEngagementEntryDto[];
}

export class ForumEngagementLeaderboardResponseDto implements IForumEngagementLeaderboardResponseDto {
  @ApiProperty({ type: () => ForumEngagementLeaderboardDto })
  leaderboard: ForumEngagementLeaderboardDto;
}

export class RecitationTimeEntryDto implements IRecitationTimeEntryDto {
  @ApiProperty({ example: 1 }) position: number;

  @ApiProperty({
    description: 'Người bật ẩn danh trên bảng thành tích: `user` là `null`.',
  })
  isAnonymous: boolean;

  @ApiProperty({ type: () => PublicAuthorSummaryDto, nullable: true })
  user: PublicAuthorSummaryDto | null;

  @ApiProperty({
    example: 5400,
    description:
      'Tổng giây server đo: mỗi phiên tối đa 2 giờ, phiên dưới 60 giây bỏ qua, phiên chồng nhau gộp lại.',
  })
  totalSeconds: number;

  @ApiProperty({ description: 'Số phiên hoàn thành được tính trong tháng.' })
  sessionCount: number;
}

export class RecitationTimeLeaderboardDto implements IRecitationTimeLeaderboardDto {
  @ApiProperty({ enum: DharmaLeaderboardPeriods })
  period: DharmaLeaderboardPeriods;

  @ApiProperty({ example: '2026-10' }) month: string;

  @ApiProperty({ type: () => [RecitationTimeEntryDto] })
  entries: RecitationTimeEntryDto[];
}

export class RecitationTimeLeaderboardResponseDto implements IRecitationTimeLeaderboardResponseDto {
  @ApiProperty({ type: () => RecitationTimeLeaderboardDto })
  leaderboard: RecitationTimeLeaderboardDto;
}
