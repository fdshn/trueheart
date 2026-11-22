import {
  CharityCompletionBlockers,
  CharityContributionTypes,
  CharityDistributionMethods,
  CharityServiceChannels,
  CharityShippingFeePayers,
  CharitySupportOfferDecisions,
  CharitySupportOfferStatuses,
  CharitySupportTypes,
} from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CharityUserBriefDto } from './charity-event.dto';

/**
 * Đợt 5b/5c — quyết định 05/11 (CHARITY-PROJECT-LIFECYCLE §3.2, §3.4, §3.11, §3.18): hỗ trợ
 * mở, hoãn bước trao, đợt trao, điều kiện hoàn tất dự án.
 */

// ── Tham số ─────────────────────────────────────────────────────────────────

export class CharitySupportNeedParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() supportNeedId: string;
}
export class CharitySupportOfferParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() offerId: string;
}
export class CharitySupportOffersQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supportNeedId?: string;

  @ApiPropertyOptional({
    description:
      '`true` = chỉ đề nghị của tôi (ai cũng xem được của mình). Bỏ trống = toàn bộ (ban tổ chức).',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mine?: boolean;
}

// ── Hỗ trợ mở ───────────────────────────────────────────────────────────────

class CharitySupportExternalDto {
  @ApiProperty({ minimum: 0, description: 'Số nhận từ nguồn ngoài app' })
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  quantity: number;

  @ApiProperty({
    type: [String],
    maxItems: 10,
    description: 'Bằng chứng (https://) — bắt buộc khi `quantity > 0`',
  })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  evidenceUrls: string[];

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CharitySupportNeedInputDto {
  @ApiProperty({ enum: CharitySupportTypes })
  @IsIn(CharitySupportTypes)
  supportType: (typeof CharitySupportTypes)[number];

  @ApiProperty({ maxLength: 200 }) @IsString() @Length(1, 200) title: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ maxLength: 50, example: 'chuyến' })
  @IsString()
  @Length(1, 50)
  unit: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  targetQuantity: number;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsAt?: Date;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  locationLabel?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  requirements?: string;

  @ApiPropertyOptional({ maxLength: 500, description: 'Cách bàn giao' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  handoverMethod?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  picName?: string;

  @ApiPropertyOptional({
    maxLength: 30,
    description: 'Không hiện ở đường công khai',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  picPhone?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({
    type: () => CharitySupportExternalDto,
    description: 'Chỉ khi sửa. Bỏ trống giữ nguyên.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CharitySupportExternalDto)
  external?: CharitySupportExternalDto;

  @ApiPropertyOptional({ enum: ['OPEN', 'CLOSED'] })
  @IsOptional()
  @IsIn(['OPEN', 'CLOSED'])
  status?: 'OPEN' | 'CLOSED';
}
export class CharitySupportNeedBodyDto {
  @ApiProperty({ type: () => CharitySupportNeedInputDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharitySupportNeedInputDto)
  otherSupportNeed: CharitySupportNeedInputDto;
}

export class CharitySupportNeedDto {
  @ApiProperty({ format: 'uuid' }) supportNeedId: string;
  @ApiProperty({ format: 'uuid' }) campaignId: string;
  @ApiProperty({ enum: CharitySupportTypes }) supportType: string;
  @ApiProperty() title: string;
  @ApiProperty({ type: String, nullable: true }) description: string | null;
  @ApiProperty() unit: string;
  @ApiProperty() targetQuantity: number;
  @ApiProperty({ type: Date, nullable: true }) startsAt: Date | null;
  @ApiProperty({ type: Date, nullable: true }) endsAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) locationLabel: string | null;
  @ApiProperty({ type: String, nullable: true }) requirements: string | null;
  @ApiProperty({ type: String, nullable: true }) handoverMethod: string | null;
  @ApiProperty({ type: String, nullable: true }) picName: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Chỉ có ở bản ban tổ chức',
  })
  picPhone?: string | null;
  @ApiProperty() sortOrder: number;
  @ApiProperty({ enum: ['OPEN', 'CLOSED'] }) status: string;
  @ApiProperty({ type: () => CharitySupportExternalDto })
  external: CharitySupportExternalDto;
  @ApiProperty({ description: 'Đang chờ ban tổ chức xét' })
  pendingQuantity: number;
  @ApiProperty() acceptedQuantity: number;
  @ApiProperty({ description: 'Đã hoàn thành trong app (số thực làm)' })
  completedQuantity: number;
  @ApiProperty({ description: 'max(0, mục tiêu − hoàn thành − nguồn ngoài)' })
  remainingQuantity: number;
  @ApiProperty() offerCount: number;
  @ApiProperty() updatedAt: Date;
}
export class CharitySupportNeedResponseDto {
  @ApiProperty({ type: () => CharitySupportNeedDto })
  otherSupportNeed: CharitySupportNeedDto;
}
export class CharitySupportNeedsResponseDto {
  @ApiProperty({ type: () => [CharitySupportNeedDto] })
  otherSupportNeeds: CharitySupportNeedDto[];
}

export class CharitySupportOfferInputDto {
  @ApiProperty({ minimum: 1, description: 'Nhận một phần được' })
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  quantity: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
export class CharitySupportOfferBodyDto {
  @ApiProperty({ type: () => CharitySupportOfferInputDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharitySupportOfferInputDto)
  offer: CharitySupportOfferInputDto;
}

export class CharitySupportOfferDecisionDto {
  @ApiProperty({
    enum: CharitySupportOfferDecisions,
    description:
      '`ACCEPT` (chờ xét), `REJECT` (bắt buộc `reason`), `COMPLETE` (đã nhận — `completedQuantity` số thực làm, bỏ trống = đủ).',
  })
  @IsIn(CharitySupportOfferDecisions)
  action: (typeof CharitySupportOfferDecisions)[number];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  completedQuantity?: number;
}
export class CharitySupportOfferDecisionBodyDto {
  @ApiProperty({ type: () => CharitySupportOfferDecisionDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharitySupportOfferDecisionDto)
  decision: CharitySupportOfferDecisionDto;
}

export class CharitySupportOfferDto {
  @ApiProperty({ format: 'uuid' }) offerId: string;
  @ApiProperty({ format: 'uuid' }) supportNeedId: string;
  @ApiProperty({ format: 'uuid' }) campaignId: string;
  @ApiProperty({ type: () => CharityUserBriefDto }) user: CharityUserBriefDto;
  @ApiProperty() quantity: number;
  @ApiProperty({ type: Number, nullable: true }) completedQuantity:
    number | null;
  @ApiProperty({ type: String, nullable: true }) note: string | null;
  @ApiProperty({ enum: CharitySupportOfferStatuses }) status: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  decidedBy: string | null;
  @ApiProperty({ type: Date, nullable: true }) decidedAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) decisionReason: string | null;
  @ApiProperty() createdAt: Date;
}
export class CharitySupportOfferResponseDto {
  @ApiProperty({ type: () => CharitySupportOfferDto })
  offer: CharitySupportOfferDto;
}
export class CharitySupportOffersResponseDto {
  @ApiProperty({ type: () => [CharitySupportOfferDto] })
  offers: CharitySupportOfferDto[];
}

// ── Hoãn bước trao ──────────────────────────────────────────────────────────

export class CharityPostponeDto {
  @ApiProperty({ type: Date, description: 'Mốc trao mới — sau mốc hiện tại' })
  @Type(() => Date)
  @IsDate()
  startsAt: Date;

  @ApiPropertyOptional({
    type: Date,
    description: 'Bỏ trống = giữ nguyên độ dài bước trao',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsAt?: Date;

  @ApiProperty({ maxLength: 500 }) @IsString() @Length(1, 500) reason: string;
}
export class CharityPostponeBodyDto {
  @ApiProperty({ type: () => CharityPostponeDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityPostponeDto)
  postpone: CharityPostponeDto;
}

// ── Hình thức trao cấp chiến dịch (CR 22/11/2026) ───────────────────────────

/** Một hình thức trao cho cả chiến dịch; các trường riêng tư để phẳng như body tạo chiến dịch. */
export class CharityDistributionInputDto {
  @ApiProperty({ enum: CharityDistributionMethods, nullable: true })
  @IsOptional()
  @IsIn(CharityDistributionMethods)
  distributionMethod: (typeof CharityDistributionMethods)[number] | null;

  @ApiPropertyOptional({
    enum: CharityContributionTypes,
    isArray: true,
    maxItems: CharityContributionTypes.length,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CharityContributionTypes.length)
  @IsIn(CharityContributionTypes, { each: true })
  contributionTypes?: (typeof CharityContributionTypes)[number][];

  @ApiPropertyOptional({ enum: CharitySupportTypes })
  @IsOptional()
  @IsIn(CharitySupportTypes)
  serviceType?: (typeof CharitySupportTypes)[number];

  @ApiPropertyOptional({ enum: CharityServiceChannels })
  @IsOptional()
  @IsIn(CharityServiceChannels)
  serviceChannel?: (typeof CharityServiceChannels)[number];

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipientName?: string;

  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  recipientPhone?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  recipientAddress?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  coordinatorName?: string;

  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  coordinatorPhone?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  carrier?: string;

  @ApiPropertyOptional({ enum: CharityShippingFeePayers })
  @IsOptional()
  @IsIn(CharityShippingFeePayers)
  shippingFeePayer?: (typeof CharityShippingFeePayers)[number];

  @ApiPropertyOptional({ minimum: 0, maximum: 10_000_000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  estimatedShippingFee?: number;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  trackingCode?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  transferContent?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Tài khoản thụ hưởng ĐANG hiệu lực của chiến dịch; cần Admin xác thực trước khi hoàn tất BANK_TRANSFER',
  })
  @IsOptional()
  @IsUUID()
  beneficiaryBankAccountId?: string | null;
}

export class CharityDistributionBodyDto {
  @ApiProperty({ type: () => CharityDistributionInputDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityDistributionInputDto)
  distribution: CharityDistributionInputDto;
}

export class CharityDistributionEvidenceInputDto {
  @ApiProperty({
    type: [String],
    maxItems: 20,
    example: ['https://cdn.example.com/a.jpg'],
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  @Matches(/^https:\/\/\S+$/, { each: true })
  urls: string[];
}

export class CharityDistributionEvidenceBodyDto {
  @ApiProperty({ type: () => CharityDistributionEvidenceInputDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityDistributionEvidenceInputDto)
  evidence: CharityDistributionEvidenceInputDto;
}

export class CharityDistributionPrivateDetailsDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  beneficiaryBankAccountId: string | null;
  @ApiProperty({ type: String, nullable: true }) recipientName: string | null;
  @ApiProperty({ type: String, nullable: true }) recipientPhone: string | null;
  @ApiProperty({ type: String, nullable: true }) recipientAddress:
    string | null;
  @ApiProperty({ type: String, nullable: true }) coordinatorName: string | null;
  @ApiProperty({ type: String, nullable: true }) coordinatorPhone:
    string | null;
  @ApiProperty({ type: String, nullable: true }) carrier: string | null;
  @ApiProperty({ enum: CharityShippingFeePayers, nullable: true })
  shippingFeePayer: string | null;
  @ApiProperty({ type: Number, nullable: true })
  estimatedShippingFee: number | null;
  @ApiProperty({ type: String, nullable: true }) trackingCode: string | null;
  @ApiProperty({ type: String, nullable: true }) transferContent: string | null;
}

/** Bản công khai: chỉ 5 trường, không có chi tiết riêng tư. */
export class CharityDistributionPublicDto {
  @ApiProperty({ enum: CharityDistributionMethods, nullable: true })
  method: string | null;
  @ApiProperty({ enum: CharityContributionTypes, isArray: true })
  contributionTypes: string[];
  @ApiProperty({ enum: CharitySupportTypes, nullable: true })
  serviceType: string | null;
  @ApiProperty({ enum: CharityServiceChannels, nullable: true })
  serviceChannel: string | null;
  @ApiProperty({
    type: [String],
    description: 'Ảnh bằng chứng trao (công khai)',
  })
  evidenceUrls: string[];
}

/** Bản workspace: đủ chi tiết riêng tư. */
export class CharityDistributionDto {
  @ApiProperty({ format: 'uuid' }) campaignId: string;
  @ApiProperty({ enum: CharityDistributionMethods, nullable: true })
  distributionMethod: string | null;
  @ApiProperty({ enum: CharityContributionTypes, isArray: true })
  contributionTypes: string[];
  @ApiProperty({ enum: CharitySupportTypes, nullable: true })
  serviceType: string | null;
  @ApiProperty({ enum: CharityServiceChannels, nullable: true })
  serviceChannel: string | null;
  @ApiProperty({ type: [String] }) evidenceUrls: string[];
  @ApiProperty({ type: () => CharityDistributionPrivateDetailsDto })
  privateDetails: CharityDistributionPrivateDetailsDto;
  @ApiProperty({ type: Date, nullable: true }) updatedAt: Date | null;
}

export class CharityDistributionResponseDto {
  @ApiProperty({ type: () => CharityDistributionDto, nullable: true })
  distribution: CharityDistributionDto | null;
}

// ── Hoàn tất dự án ──────────────────────────────────────────────────────────

class CharityCompletionBlockerDto {
  @ApiProperty({ enum: CharityCompletionBlockers }) code: string;
  @ApiProperty() label: string;
}
export class CharityCompletionResponseDto {
  @ApiProperty() canComplete: boolean;
  @ApiProperty({ type: () => [CharityCompletionBlockerDto] })
  blockers: CharityCompletionBlockerDto[];
}
