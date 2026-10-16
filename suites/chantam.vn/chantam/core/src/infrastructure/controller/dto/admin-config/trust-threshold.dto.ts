import { MaxGiverAccuracySamples } from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** Trần cho `minReports`: cao hơn thế thì không ai bao giờ vào diện xem xét. */
const MaxAbuseMinReports = 1000;

export class GiverAccuracyThresholdDto {
  @ApiProperty({
    minimum: 1,
    maximum: MaxGiverAccuracySamples,
    example: 5,
    description:
      'Số lượt đánh giá tối thiểu trước khi công bố chỉ số mô tả đúng. Dưới ngưỡng thì chỉ số là `null`.',
  })
  @IsInt()
  @Min(1)
  @Max(MaxGiverAccuracySamples)
  minSamples: number;

  @ApiProperty({
    minimum: 0,
    maximum: 100,
    example: 75,
    description:
      'Chỉ số dưới mức này thì người tặng vào diện Admin xem xét. KHÔNG tự phạt.',
  })
  @IsInt()
  @Min(0)
  @Max(100)
  reviewThresholdPercent: number;
}

export class ReviewRatingThresholdDto {
  @ApiProperty({
    minimum: 1,
    maximum: MaxGiverAccuracySamples,
    example: 3,
    description:
      'Số lượt chấm sao tối thiểu trước khi công bố điểm trung bình. Không gắn cờ ai.',
  })
  @IsInt()
  @Min(1)
  @Max(MaxGiverAccuracySamples)
  minSamples: number;
}

export class ReportAbuseThresholdDto {
  @ApiProperty({
    minimum: 1,
    maximum: MaxAbuseMinReports,
    example: 5,
    description:
      'Số lượt báo ĐÃ CÓ KẾT LUẬN tối thiểu trước khi tỷ lệ bị bác có nghĩa.',
  })
  @IsInt()
  @Min(1)
  @Max(MaxAbuseMinReports)
  minReports: number;

  @ApiProperty({
    minimum: 0,
    maximum: 100,
    example: 80,
    description:
      'Tỷ lệ báo bị BÁC từ mức này trở lên thì người báo vào diện Admin xem xét.',
  })
  @IsInt()
  @Min(0)
  @Max(100)
  dismissedRatioPercent: number;
}

export class SetGiverAccuracyThresholdDto extends GiverAccuracyThresholdDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class SetReviewRatingThresholdDto extends ReviewRatingThresholdDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class SetReportAbuseThresholdDto extends ReportAbuseThresholdDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class SetGiverAccuracyThresholdBodyDto {
  @ApiProperty({ type: () => SetGiverAccuracyThresholdDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SetGiverAccuracyThresholdDto)
  giverAccuracy: SetGiverAccuracyThresholdDto;
}

export class SetReviewRatingThresholdBodyDto {
  @ApiProperty({ type: () => SetReviewRatingThresholdDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SetReviewRatingThresholdDto)
  reviewRating: SetReviewRatingThresholdDto;
}

export class SetReportAbuseThresholdBodyDto {
  @ApiProperty({ type: () => SetReportAbuseThresholdDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SetReportAbuseThresholdDto)
  reportAbuse: SetReportAbuseThresholdDto;
}

const ConfiguredDescription =
  '`false` khi khoá chưa có trong `system_configs` — hệ thống chạy theo mặc định trong `value`.';

export class GiverAccuracyThresholdViewDto {
  @ApiProperty({ type: () => GiverAccuracyThresholdDto })
  value: GiverAccuracyThresholdDto;
  @ApiProperty({ description: ConfiguredDescription }) isConfigured: boolean;
}

export class ReviewRatingThresholdViewDto {
  @ApiProperty({ type: () => ReviewRatingThresholdDto })
  value: ReviewRatingThresholdDto;
  @ApiProperty({ description: ConfiguredDescription }) isConfigured: boolean;
}

export class ReportAbuseThresholdViewDto {
  @ApiProperty({ type: () => ReportAbuseThresholdDto })
  value: ReportAbuseThresholdDto;
  @ApiProperty({ description: ConfiguredDescription }) isConfigured: boolean;
}

export class TrustThresholdsResponseDto {
  @ApiProperty({
    type: () => GiverAccuracyThresholdViewDto,
    description: 'Khoá `accuracy.giver`.',
  })
  giverAccuracy: GiverAccuracyThresholdViewDto;

  @ApiProperty({
    type: () => ReviewRatingThresholdViewDto,
    description: 'Khoá `rating.display`.',
  })
  reviewRating: ReviewRatingThresholdViewDto;

  @ApiProperty({
    type: () => ReportAbuseThresholdViewDto,
    description: 'Khoá `report.abuse`.',
  })
  reportAbuse: ReportAbuseThresholdViewDto;
}
