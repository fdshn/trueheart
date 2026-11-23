import {
  IPointFeedEntryDto,
  IPointFeedResponseDto,
  IUserPointFeedResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  PointFeedDefaultLimit,
  PointFeedMaxLimit,
} from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PublicUserProfileDto } from '../charity-campaign/charity-campaign.dto';

export class PointFeedQueryDto {
  @ApiPropertyOptional({
    minimum: 0,
    description:
      'Chỉ lấy bút toán có id lớn hơn — gửi lại `latestId` của lượt trước. Bỏ trống = các dòng mới nhất.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  afterId?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: PointFeedMaxLimit,
    default: PointFeedDefaultLimit,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PointFeedMaxLimit)
  limit?: number;
}

export class UserPointFeedParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId: string;
}

class PointFeedContextDto {
  @ApiProperty({ enum: ['CHARITY_CAMPAIGN', 'POST'] })
  type: 'CHARITY_CAMPAIGN' | 'POST';
  @ApiProperty() id: string;
  @ApiProperty() title: string;
}

export class PointFeedEntryDto implements IPointFeedEntryDto {
  @ApiProperty({ description: 'Id bút toán — dùng làm `afterId`.' })
  entryId: number;
  @ApiProperty({ type: () => PublicUserProfileDto })
  user: PublicUserProfileDto;
  @ApiProperty({ description: 'Điểm gốc + thưởng hệ số chiến dịch đã gộp.' })
  delta: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Hệ số chiến dịch (%) khi dòng có thưởng; `null` khi không.',
  })
  bonusPercent: number | null;
  @ApiProperty({ example: 'Tham gia dự án từ thiện' }) ruleTitle: string;
  @ApiProperty({ format: 'date-time' }) occurredAt: string;
  @ApiProperty({ type: () => PointFeedContextDto, nullable: true })
  context: PointFeedContextDto | null;
}

export class PointFeedResponseDto implements IPointFeedResponseDto {
  @ApiProperty({ type: () => [PointFeedEntryDto], description: 'Cũ → mới.' })
  entries: PointFeedEntryDto[];
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Gửi lại làm `afterId` ở lượt hỏi kế tiếp.',
  })
  latestId: number | null;
  @ApiProperty({
    description: 'Hỏi lại sau bao nhiêu giây (`point.feed_poll_seconds`).',
  })
  pollAfterSeconds: number;
  @ApiProperty({
    description:
      'Mỗi dòng mới hiện cách nhau bao nhiêu ms (`point.feed_display_interval_ms`).',
  })
  displayIntervalMs: number;
}

export class UserPointFeedResponseDto
  extends PointFeedResponseDto
  implements IUserPointFeedResponseDto
{
  @ApiProperty() balance: number;
  @ApiProperty() lifetime: number;
}
