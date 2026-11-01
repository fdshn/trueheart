import {
  AttributionPlatforms,
  AttributionRiskStatuses,
  AttributionTargetTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IAttributionClaimSummaryDto,
  IAttributionDeepLinkDto,
  IAttributionLinkDto,
  IAttributionReferrerDto,
  IClaimAttributionBodyDto,
  IClaimAttributionResponseDto,
  ICreateAttributionLinkBodyDto,
  ICreateAttributionLinkDto,
  ICreateAttributionLinkResponseDto,
  IListAttributionClaimsQueryDto,
  IListAttributionClaimsResponseDto,
  IRecordAttributionClickBodyDto,
  IRecordAttributionClickDto,
  IRecordAttributionClickResponseDto,
  IResolveAttributionBodyDto,
  IResolveAttributionResponseDto,
  IReviewAttributionClaimBodyDto,
  IReviewAttributionClaimDto,
  IReviewAttributionClaimResponseDto,
  IRevokeAttributionLinksBodyDto,
  IRevokeAttributionLinksDto,
  IRevokeAttributionLinksResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AttributionDeepLinkDto implements IAttributionDeepLinkDto {
  @ApiProperty({ enum: AttributionTargetTypes }) type: AttributionTargetTypes;
  @ApiProperty({
    description: 'Mã chia sẻ bài, username (PROFILE/USER) hoặc mã mời nhóm.',
  })
  value: string;
}

// ── Tạo link ────────────────────────────────────────────────────────────────

export class CreateAttributionLinkDto implements ICreateAttributionLinkDto {
  @ApiPropertyOptional({ enum: AttributionTargetTypes, nullable: true })
  @IsOptional()
  @IsEnum(AttributionTargetTypes)
  targetType?: AttributionTargetTypes | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 64,
    description:
      'POST: `share.shareCode` của bài. PROFILE/USER: username. GROUP_INVITE: mã mời nhóm. Cùng có hoặc cùng bỏ trống với `targetType`.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetValue?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  campaign?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  medium?: string | null;
}

export class CreateAttributionLinkBodyDto implements ICreateAttributionLinkBodyDto {
  @ApiProperty({ type: () => CreateAttributionLinkDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateAttributionLinkDto)
  link: CreateAttributionLinkDto;
}

export class AttributionLinkDto implements IAttributionLinkDto {
  @ApiProperty({ example: 'K7QX2MPA9D' }) code: string;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://chantam.vn/a/K7QX2MPA9D',
    description: '`null` khi máy chủ chưa cấu hình `WEB_PUBLIC_BASE_URL`.',
  })
  url: string | null;
  @ApiProperty({ type: () => AttributionDeepLinkDto, nullable: true })
  deepLink: AttributionDeepLinkDto | null;
  @ApiProperty({ type: String, nullable: true }) campaign: string | null;
  @ApiProperty({ type: String, nullable: true }) source: string | null;
  @ApiProperty({ type: String, nullable: true }) medium: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}

export class CreateAttributionLinkResponseDto implements ICreateAttributionLinkResponseDto {
  @ApiProperty({ type: () => AttributionLinkDto }) link: AttributionLinkDto;
  @ApiProperty({ description: '`false` khi link y hệt đã có và được trả lại.' })
  created: boolean;
}

// ── Ghi nhận lượt mở ───────────────────────────────────────────────────────

export class RecordAttributionClickDto implements IRecordAttributionClickDto {
  @ApiProperty({ example: 'K7QX2MPA9D', description: 'Mã trong `…/a/{code}`.' })
  @IsString()
  @Matches(/^[A-Za-z0-9]{6,16}$/)
  code: string;
}

export class RecordAttributionClickBodyDto implements IRecordAttributionClickBodyDto {
  @ApiProperty({ type: () => RecordAttributionClickDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => RecordAttributionClickDto)
  click: RecordAttributionClickDto;
}

export class AttributionReferrerDto implements IAttributionReferrerDto {
  @ApiProperty() username: string;
  @ApiProperty({ type: String, nullable: true }) fullName: string | null;
  @ApiProperty({ type: String, nullable: true }) avatarUrl: string | null;
}

export class AttributionClickDto {
  @ApiProperty({
    description:
      'Token có chữ ký, sống 14 ngày. Landing chỉ copy vào clipboard khi người dùng BẤM nút.',
  })
  token: string;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt: Date;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://chantam.vn/dl?t=eyJ…',
  })
  deepLinkUrl: string | null;
  @ApiProperty({ type: () => AttributionReferrerDto })
  referrer: AttributionReferrerDto;
  @ApiProperty({ type: () => AttributionDeepLinkDto, nullable: true })
  deepLink: AttributionDeepLinkDto | null;
}

export class RecordAttributionClickResponseDto implements IRecordAttributionClickResponseDto {
  @ApiProperty({ type: () => AttributionClickDto }) click: AttributionClickDto;
}

// ── Resolve ─────────────────────────────────────────────────────────────────

export class ResolveAttributionBodyDto implements IResolveAttributionBodyDto {
  @ApiProperty({
    description:
      'Token dán từ clipboard. Nhận cả token trần lẫn nguyên URL `https://chantam.vn/dl?t=<token>`.',
  })
  @IsString()
  @Length(1, 2048)
  token: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'UUID app sinh một lần và lưu trong secure storage. Server chỉ lưu dạng HMAC.',
  })
  @IsUUID()
  installId: string;

  @ApiProperty({ enum: AttributionPlatforms })
  @IsEnum(AttributionPlatforms)
  platform: AttributionPlatforms;
}

export class ResolveAttributionResponseDto implements IResolveAttributionResponseDto {
  @ApiProperty() matched: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Claim token dùng một lần, sống 24 giờ — gửi lên `POST /attribution/claim` sau khi đăng ký.',
  })
  attributionToken: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Mã giới thiệu của người mời, CHỈ để hiển thị. Claim không đọc trường này.',
  })
  referralCode: string | null;
  @ApiProperty({ type: () => AttributionDeepLinkDto, nullable: true })
  deepLink: AttributionDeepLinkDto | null;
}

// ── Claim ───────────────────────────────────────────────────────────────────

export class ClaimAttributionBodyDto implements IClaimAttributionBodyDto {
  @ApiProperty({
    description: 'Claim token nhận từ `POST /attribution/resolve`.',
  })
  @IsString()
  @Length(1, 2048)
  attributionToken: string;
}

export class ClaimAttributionResponseDto implements IClaimAttributionResponseDto {
  @ApiProperty() claimed: boolean;
  @ApiProperty({
    enum: AttributionRiskStatuses,
    description:
      '`PENDING_REVIEW`: vướng tín hiệu gian lận, quan hệ giới thiệu chờ Admin duyệt. App không cần xử lý khác.',
  })
  riskStatus: AttributionRiskStatuses;
}

// ── Admin ───────────────────────────────────────────────────────────────────

export class ListAttributionClaimsQueryDto
  extends PaginationQueryDto
  implements IListAttributionClaimsQueryDto
{
  @ApiPropertyOptional({ enum: AttributionRiskStatuses })
  @IsOptional()
  @IsEnum(AttributionRiskStatuses)
  riskStatus?: AttributionRiskStatuses;
}

export class AttributionClaimSummaryDto implements IAttributionClaimSummaryDto {
  @ApiProperty({ format: 'uuid' }) claimId: string;
  @ApiProperty({ enum: AttributionRiskStatuses })
  riskStatus: AttributionRiskStatuses;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'INSTALL_REUSED',
    description:
      '`INSTALL_REUSED`: cùng bản cài đã claim cho tài khoản khác trong 30 ngày.',
  })
  riskReason: string | null;
  @ApiProperty({ format: 'uuid' }) referrerUserId: string;
  @ApiProperty() referrerUsername: string;
  @ApiProperty({ format: 'uuid' }) referredUserId: string;
  @ApiProperty() referredUsername: string;
  @ApiProperty() linkCode: string;
  @ApiProperty({ type: String, nullable: true }) campaign: string | null;
  @ApiProperty({ enum: AttributionPlatforms }) platform: AttributionPlatforms;
  @ApiProperty({ type: String, format: 'date-time' }) claimedAt: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  reviewedAt: Date | null;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Người được mời đã hoàn tất onboarding và người giới thiệu đã được thưởng.',
  })
  referralQualifiedAt: Date | null;
}

export class ListAttributionClaimsResponseDto implements IListAttributionClaimsResponseDto {
  @ApiProperty({ type: () => [AttributionClaimSummaryDto] })
  claims: AttributionClaimSummaryDto[];
  @ApiProperty({ type: () => PaginationMetaDto }) meta: PaginationMetaDto;
}

export class AttributionClaimParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  claimId: string;
}

export class ReviewAttributionClaimDto implements IReviewAttributionClaimDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  @IsIn(['APPROVE', 'REJECT'])
  decision: 'APPROVE' | 'REJECT';

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @Length(1, 500)
  note: string;
}

export class ReviewAttributionClaimBodyDto implements IReviewAttributionClaimBodyDto {
  @ApiProperty({ type: () => ReviewAttributionClaimDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ReviewAttributionClaimDto)
  review: ReviewAttributionClaimDto;
}

export class ReviewAttributionClaimResponseDto implements IReviewAttributionClaimResponseDto {
  @ApiProperty({ type: () => AttributionClaimSummaryDto })
  claim: AttributionClaimSummaryDto;
}

export class RevokeAttributionLinksDto implements IRevokeAttributionLinksDto {
  @ApiPropertyOptional({ example: 'K7QX2MPA9D' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  linkCode?: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  campaign?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  referrerUserId?: string;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @Length(1, 500)
  reason: string;
}

export class RevokeAttributionLinksBodyDto implements IRevokeAttributionLinksBodyDto {
  @ApiProperty({
    type: () => RevokeAttributionLinksDto,
    description: 'Đúng một trong `linkCode`, `campaign`, `referrerUserId`.',
  })
  @IsDefined()
  @ValidateNested()
  @Type(() => RevokeAttributionLinksDto)
  revocation: RevokeAttributionLinksDto;
}

export class RevokeAttributionLinksResponseDto implements IRevokeAttributionLinksResponseDto {
  @ApiProperty({ description: 'Số link vừa bị thu hồi.' }) revokedLinks: number;
}
