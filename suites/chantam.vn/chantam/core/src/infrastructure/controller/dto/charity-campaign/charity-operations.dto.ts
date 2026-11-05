import {
  CharityCompletionBlockers,
  CharityRoundChecklistKeys,
  CharityRoundReadinessStatuses,
  CharityRoundStatuses,
  CharityRoundWarningCodes,
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
export class CharityRoundParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() roundId: string;
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

// ── Đợt trao ────────────────────────────────────────────────────────────────

export class CharityRoundInputDto {
  @ApiProperty({ maxLength: 200, example: 'Đợt 1 — xã Pà Cò' })
  @IsString()
  @Length(1, 200)
  title: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  locationLabel?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiProperty({ type: Date }) @Type(() => Date) @IsDate() startsAt: Date;
  @ApiProperty({ type: Date }) @Type(() => Date) @IsDate() endsAt: Date;

  @ApiPropertyOptional({
    maxLength: 500,
    description:
      'Bắt buộc khi đổi giờ / địa điểm đợt của dự án đã duyệt — người của đợt nhận thông báo kèm lý do',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
export class CharityRoundBodyDto {
  @ApiProperty({ type: () => CharityRoundInputDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityRoundInputDto)
  round: CharityRoundInputDto;
}

export class CharityRoundStatusDto {
  @ApiProperty({ enum: ['DONE', 'CANCELLED'] })
  @IsIn(['DONE', 'CANCELLED'])
  status: 'DONE' | 'CANCELLED';

  @ApiPropertyOptional({ maxLength: 500, description: 'Bắt buộc khi huỷ' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
export class CharityRoundStatusBodyDto {
  @ApiProperty({ type: () => CharityRoundStatusDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityRoundStatusDto)
  status: CharityRoundStatusDto;
}

class CharityRoundChecklistItemDto {
  @ApiProperty({ enum: CharityRoundChecklistKeys })
  @IsIn(CharityRoundChecklistKeys)
  key: (typeof CharityRoundChecklistKeys)[number];

  @ApiProperty() @IsBoolean() done: boolean;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class CharityRoundReadinessDto {
  @ApiProperty({ enum: ['READY', 'NOT_READY'] })
  @IsIn(['READY', 'NOT_READY'])
  status: 'READY' | 'NOT_READY';

  @ApiPropertyOptional({
    maxLength: 1000,
    description: 'Bắt buộc khi `NOT_READY`',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({
    type: () => [CharityRoundChecklistItemDto],
    description: 'Mục không gửi giữ nguyên',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CharityRoundChecklistKeys.length)
  @ValidateNested({ each: true })
  @Type(() => CharityRoundChecklistItemDto)
  checklist?: CharityRoundChecklistItemDto[];
}
export class CharityRoundReadinessBodyDto {
  @ApiProperty({ type: () => CharityRoundReadinessDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityRoundReadinessDto)
  readiness: CharityRoundReadinessDto;
}

export class CharityRoundAssignmentsDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: '`null` = gỡ khỏi đợt',
  })
  @IsOptional()
  @Matches(/^[0-9a-f-]{36}$/i)
  roundId: string | null;

  @ApiPropertyOptional({ type: [String], maxItems: 500 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  participationIds?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 500 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  deliveryIds?: string[];
}
export class CharityRoundAssignmentsBodyDto {
  @ApiProperty({ type: () => CharityRoundAssignmentsDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityRoundAssignmentsDto)
  assignments: CharityRoundAssignmentsDto;
}
export class CharityRoundAssignmentsResponseDto {
  @ApiProperty() participations: number;
  @ApiProperty() deliveries: number;
}

class CharityRoundStatsDto {
  @ApiProperty() participantCount: number;
  @ApiProperty() attendedCount: number;
  @ApiProperty() deliveryCount: number;
  @ApiProperty() completedDeliveryCount: number;
  @ApiProperty({ description: 'VNĐ, lượt giao nhận đã hoàn tất' })
  confirmedValue: number;
}

export class CharityRoundPublicDto {
  @ApiProperty({ format: 'uuid' }) roundId: string;
  @ApiProperty({ format: 'uuid' }) campaignId: string;
  @ApiProperty() title: string;
  @ApiProperty({ type: String, nullable: true }) locationLabel: string | null;
  @ApiProperty({ type: String, nullable: true }) address: string | null;
  @ApiProperty() startsAt: Date;
  @ApiProperty() endsAt: Date;
  @ApiProperty({ enum: CharityRoundStatuses }) status: string;
  @ApiProperty({ type: String, nullable: true }) statusReason: string | null;
  @ApiProperty({ type: () => CharityRoundStatsDto })
  stats: CharityRoundStatsDto;
  @ApiProperty() updatedAt: Date;
}
export class CharityRoundDto extends CharityRoundPublicDto {
  @ApiProperty({ enum: CharityRoundReadinessStatuses }) readiness: string;
  @ApiProperty({ type: String, nullable: true }) readinessNote: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  readinessBy: string | null;
  @ApiProperty({ type: Date, nullable: true }) readinessAt: Date | null;
  @ApiProperty({ type: () => [CharityRoundChecklistItemDto] })
  checklist: CharityRoundChecklistItemDto[];
  @ApiProperty({
    enum: CharityRoundWarningCodes,
    isArray: true,
    description: 'Cảnh báo trước 48 giờ — không chặn sự kiện',
  })
  warnings: string[];
}
export class CharityRoundResponseDto {
  @ApiProperty({ type: () => CharityRoundDto }) round: CharityRoundDto;
}
export class CharityRoundsResponseDto {
  @ApiProperty({ type: () => [CharityRoundDto] }) rounds: CharityRoundDto[];
}
export class CharityPublicRoundsResponseDto {
  @ApiProperty({ type: () => [CharityRoundPublicDto] })
  rounds: CharityRoundPublicDto[];
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
