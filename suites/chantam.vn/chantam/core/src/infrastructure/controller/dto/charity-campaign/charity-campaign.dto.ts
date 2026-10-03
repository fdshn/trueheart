import { CharityCampaignPhases } from '@/domain/ports/repository';
import {
  CharityApprovalStatuses,
  CharityReviewRatingMax,
  CharityReviewRatingMin,
  CharityReviewRoles,
  MaxCharityBadgeNameLength,
  MaxCharityDescriptionLength,
  MaxCharityReviewCommentLength,
  MaxCharitySlugLength,
  MaxCharityTargetItems,
  MaxCharityTitleLength,
} from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsISO8601,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class WriteCharityCampaignDto {
  @ApiProperty({
    example: 'Bếp cơm Vu Lan 2026',
    maxLength: MaxCharityTitleLength,
  })
  @IsString()
  @Length(3, MaxCharityTitleLength)
  title: string;

  @ApiPropertyOptional({
    example: 'bep-com-vu-lan-2026',
    maxLength: MaxCharitySlugLength,
    description:
      'Bỏ trống thì sinh từ tiêu đề. Gửi vào thì vẫn bị chuẩn hoá y hệt — không có hai ' +
      'cách viết cho một đường.',
  })
  @IsOptional()
  @IsString()
  @Length(1, MaxCharitySlugLength)
  slug?: string;

  @ApiProperty({ maxLength: MaxCharityDescriptionLength })
  @IsString()
  @Length(10, MaxCharityDescriptionLength)
  description: string;

  @ApiProperty({
    example: 'https://cdn.chantam.vn/campaigns/vu-lan-2026.jpg',
    description:
      'Bắt buộc `https://` — ảnh bìa qua `http` làm trình duyệt chặn nội dung.',
  })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  bannerUrl: string;

  @ApiProperty({
    example: 'Tấm lòng Vu Lan',
    maxLength: MaxCharityBadgeNameLength,
    description: 'Huy hiệu người tham gia nhận được (§6.2.13 `badge_name`).',
  })
  @IsString()
  @Length(1, MaxCharityBadgeNameLength)
  badgeName: string;

  @ApiPropertyOptional({
    example: 500,
    minimum: 0,
    maximum: MaxCharityTargetItems,
    default: 0,
    description:
      'Số phần quà mục tiêu. `0` nghĩa là KHÔNG đặt mục tiêu số lượng, và khi đó ' +
      '`progressPercent` trả `null` thay vì `0%`.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MaxCharityTargetItems)
  targetItemsCount?: number;

  @ApiPropertyOptional({
    example: 10.7797,
    description:
      'Vị trí để hiện trên Map Discovery (UI-CHARITY-01). Phải gửi CÙNG `lng`. Bỏ cả ' +
      'hai với hoạt động không gắn địa điểm — một toạ độ bịa trên bản đồ tệ hơn không ' +
      'có toạ độ nào.',
  })
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({
    example: 106.699,
    description: 'Phải gửi CÙNG `lat`.',
  })
  @IsOptional()
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ example: 'Chùa Vĩnh Nghiêm, Quận 3', maxLength: 255 })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  locationLabel?: string;

  @ApiProperty({ example: '2026-08-20T01:00:00.000Z' })
  @IsISO8601()
  startTime: string;

  @ApiProperty({
    example: '2026-08-20T09:00:00.000Z',
    description:
      'Phải sau `startTime` — `CHK_campaigns_time_order` canh ở database.',
  })
  @IsISO8601()
  endTime: string;
}

export class WriteCharityCampaignBodyDto {
  @ApiProperty({ type: () => WriteCharityCampaignDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => WriteCharityCampaignDto)
  campaign: WriteCharityCampaignDto;
}

export class ListCharityCampaignsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({
    enum: CharityCampaignPhases,
    description:
      '`UPCOMING` chưa bắt đầu · `ONGOING` đang diễn ra · `ENDED` đã kết thúc. Mốc so ' +
      'là `now()` của database, không phải giờ máy client.',
  })
  @IsOptional()
  @IsIn(CharityCampaignPhases as readonly string[])
  phase?: string;
}

export class ListAdminCharityCampaignsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ enum: CharityApprovalStatuses })
  @IsOptional()
  @IsIn(CharityApprovalStatuses as readonly string[])
  approvalStatus?: string;
}

export class CharityCampaignIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id: string;
}

export class ReviewCharityCampaignDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Người được đánh giá. Người tổ chức chấm người tham gia, người tham gia chấm ' +
      'người tổ chức — và CHỈ hai chiều đó. Hai người tham gia không chấm nhau được.',
  })
  @IsUUID()
  revieweeId: string;

  @ApiProperty({
    minimum: CharityReviewRatingMin,
    maximum: CharityReviewRatingMax,
    example: 5,
  })
  @IsInt()
  @Min(CharityReviewRatingMin)
  @Max(CharityReviewRatingMax)
  rating: number;

  @ApiPropertyOptional({ maxLength: MaxCharityReviewCommentLength })
  @IsOptional()
  @IsString()
  @Length(1, MaxCharityReviewCommentLength)
  comment?: string;
}

export class ReviewCharityCampaignBodyDto {
  @ApiProperty({ type: () => ReviewCharityCampaignDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ReviewCharityCampaignDto)
  review: ReviewCharityCampaignDto;
}

export class DecideCharityApprovalDto {
  @ApiProperty({
    description:
      '`true` duyệt · `false` từ chối. Cả hai đều ghi `approvedBy` và mốc thời gian.',
  })
  @IsBoolean()
  approve: boolean;

  @ApiPropertyOptional({
    maxLength: 1_000,
    description:
      'Lý do, hiện cho người gửi hồ sơ. Từ chối mà không nói vì sao là buộc họ gửi lại ' +
      'đúng hồ sơ đó.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 1_000)
  note?: string;
}

export class DecideCharityApprovalBodyDto {
  @ApiProperty({ type: () => DecideCharityApprovalDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => DecideCharityApprovalDto)
  approval: DecideCharityApprovalDto;
}

export class UpdateCharityProgressDto {
  @ApiProperty({
    minimum: 0,
    maximum: MaxCharityTargetItems,
    example: 480,
    description:
      'Số phần quà ĐÃ TRAO, theo lời khai của người tổ chức. BR-CHARITY-02: hệ thống ' +
      'không đối soát con số này với giao dịch nào.',
  })
  @IsInt()
  @Min(0)
  @Max(MaxCharityTargetItems)
  currentItemsCount: number;
}

export class UpdateCharityProgressBodyDto {
  @ApiProperty({ type: () => UpdateCharityProgressDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => UpdateCharityProgressDto)
  progress: UpdateCharityProgressDto;
}

export class SetCharityCampaignActiveDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}

export class SetCharityCampaignActiveBodyDto {
  @ApiProperty({ type: () => SetCharityCampaignActiveDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SetCharityCampaignActiveDto)
  campaign: SetCharityCampaignActiveDto;
}

export class CharityCampaignResponseDto {
  @ApiProperty() globalId: string;
  @ApiProperty() title: string;
  @ApiProperty() slug: string;
  @ApiProperty() description: string;
  @ApiProperty() bannerUrl: string;
  @ApiProperty() badgeName: string;

  @ApiProperty({ description: '`0` nghĩa là không đặt mục tiêu số lượng.' })
  targetItemsCount: number;

  @ApiProperty({
    description:
      'LỜI KHAI của người tổ chức, không phải số đo. BR-CHARITY-02: hệ thống không đối ' +
      'soát với `gift_transactions` hay bất cứ bảng giao dịch nào, và không có hook nào ' +
      'tự tăng nó.',
  })
  currentItemsCount: number;

  @ApiProperty({
    nullable: true,
    description:
      '`null` khi `targetItemsCount = 0` — hiện "0%" cho hoạt động như vậy là nói sai.',
  })
  progressPercent: number | null;

  @ApiProperty({ nullable: true }) lat: number | null;
  @ApiProperty({ nullable: true }) lng: number | null;
  @ApiProperty({ nullable: true }) locationLabel: string | null;
  @ApiProperty() startTime: Date;
  @ApiProperty() endTime: Date;
  @ApiProperty() isActive: boolean;

  @ApiProperty({ enum: CharityApprovalStatuses })
  approvalStatus: string;

  @ApiProperty({ nullable: true }) approvalNote: string | null;
  @ApiProperty({ nullable: true }) approvedAt: Date | null;
  @ApiProperty({ nullable: true }) approvedBy: string | null;
  @ApiProperty({ nullable: true }) createdBy: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  @ApiProperty({
    description: 'Số người đang đăng ký — đếm lúc đọc, không phải cột lưu sẵn.',
  })
  participantCount: number;

  @ApiProperty({
    nullable: true,
    description:
      '`null` trên đường công khai (không có ai để hỏi), `true`/`false` trên các đường ' +
      'cần token. `null` KHÔNG đồng nghĩa `false`.',
  })
  isJoined: boolean | null;
}

export class CharityReviewResponseDto {
  @ApiProperty() globalId: string;
  @ApiProperty() campaignId: string;
  @ApiProperty() reviewerId: string;
  @ApiProperty() revieweeId: string;

  @ApiProperty({ enum: CharityReviewRoles })
  reviewerRole: string;

  @ApiProperty() rating: number;
  @ApiProperty({ nullable: true }) comment: string | null;
  @ApiProperty() createdAt: Date;
}

export class CharityCampaignDetailResponseDto {
  @ApiProperty({ type: () => CharityCampaignResponseDto })
  campaign: CharityCampaignResponseDto;

  @ApiProperty({ type: () => [CharityReviewResponseDto] })
  reviews: CharityReviewResponseDto[];

  @ApiProperty() reviewTotal: number;
}

export class ListCharityCampaignsResponseDto {
  @ApiProperty({ type: () => [CharityCampaignResponseDto] })
  items: CharityCampaignResponseDto[];

  @ApiProperty() total: number;
}

export class CharityCampaignWrapperResponseDto {
  @ApiProperty({ type: () => CharityCampaignResponseDto })
  campaign: CharityCampaignResponseDto;
}

export class CharityReviewWrapperResponseDto {
  @ApiProperty({ type: () => CharityReviewResponseDto })
  review: CharityReviewResponseDto;
}
