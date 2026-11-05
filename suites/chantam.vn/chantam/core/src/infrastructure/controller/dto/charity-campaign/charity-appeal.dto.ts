import {
  CharityAppealOutcomes,
  CharityAppealStatuses,
  CharityAppealTargetTypes,
} from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Khiếu nại hai tầng (CHARITY-PROJECT-LIFECYCLE §3.16). */

export class CharityAppealParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() appealId: string;
}

export class CharityAppealCreateDto {
  @ApiProperty({
    enum: CharityAppealTargetTypes,
    description:
      '`EVALUATION`: mức hoàn thành (`targetId` = `evaluationId` HIỆN HÀNH của mình). `ITEM_VALUE`: giá trị ban tổ chức xác nhận (`targetId` = id lượt giao nhận của mình).',
  })
  @IsIn(CharityAppealTargetTypes)
  targetType: (typeof CharityAppealTargetTypes)[number];

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetId: string;

  @ApiPropertyOptional({
    description: 'Mức mong muốn: điểm 0–100 hoặc VNĐ',
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  requestedValue?: number | null;

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @IsString()
  @Length(10, 2000)
  description: string;

  @ApiPropertyOptional({ type: [String], maxItems: 10 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  evidenceUrls?: string[];
}
export class CharityAppealCreateBodyDto {
  @ApiProperty({ type: () => CharityAppealCreateDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityAppealCreateDto)
  appeal: CharityAppealCreateDto;
}

export class CharityAppealDecisionDto {
  @ApiProperty({
    enum: ['ADJUST', 'KEEP', 'ACCEPT', 'ESCALATE'],
    description:
      'Ban tổ chức (tầng 1): `ADJUST` (kèm `value`) / `KEEP`, bắt buộc `reason`. Người khiếu nại sau đó: `ACCEPT` / `ESCALATE` (lên Admin).',
  })
  @IsIn(['ADJUST', 'KEEP', 'ACCEPT', 'ESCALATE'])
  action: 'ADJUST' | 'KEEP' | 'ACCEPT' | 'ESCALATE';

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  value?: number | null;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
export class CharityAppealDecisionBodyDto {
  @ApiProperty({ type: () => CharityAppealDecisionDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityAppealDecisionDto)
  decision: CharityAppealDecisionDto;
}

export class CharityAdminAppealDecisionDto {
  @ApiProperty({
    enum: ['ADJUST', 'KEEP', 'REJECT', 'REOPEN'],
    description:
      'Tầng 2 (chỉ khi `ADMIN_REVIEW`): quyết cuối. `REOPEN`: mở lại khiếu nại đã đóng về Admin.',
  })
  @IsIn(['ADJUST', 'KEEP', 'REJECT', 'REOPEN'])
  action: 'ADJUST' | 'KEEP' | 'REJECT' | 'REOPEN';

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  value?: number | null;

  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @Length(1, 1000)
  reason: string;
}
export class CharityAdminAppealDecisionBodyDto {
  @ApiProperty({ type: () => CharityAdminAppealDecisionDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityAdminAppealDecisionDto)
  decision: CharityAdminAppealDecisionDto;
}

export class CharityAdminAppealsQueryDto {
  @ApiPropertyOptional({ enum: CharityAppealStatuses })
  @IsOptional()
  @IsIn(CharityAppealStatuses)
  status?: (typeof CharityAppealStatuses)[number];

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class CharityAppealDto {
  @ApiProperty({ format: 'uuid' }) appealId: string;
  @ApiProperty({ format: 'uuid' }) campaignId: string;
  @ApiProperty() campaignTitle: string;
  @ApiProperty({ format: 'uuid' }) appellantId: string;
  @ApiProperty({ type: String, nullable: true }) appellantUsername:
    string | null;
  @ApiProperty({ enum: CharityAppealTargetTypes }) targetType: string;
  @ApiProperty({ format: 'uuid' }) targetId: string;
  @ApiProperty() originalValue: number;
  @ApiProperty({ type: Number, nullable: true }) requestedValue: number | null;
  @ApiProperty() description: string;
  @ApiProperty({ type: [String] }) evidenceUrls: string[];
  @ApiProperty({ enum: CharityAppealStatuses }) status: string;
  @ApiProperty({ enum: [1, 2] }) tier: number;
  @ApiProperty({ enum: ['ADJUST', 'KEEP'], nullable: true })
  organizerDecision: string | null;
  @ApiProperty({ type: Number, nullable: true }) organizerValue: number | null;
  @ApiProperty({ type: String, nullable: true }) organizerReason: string | null;
  @ApiProperty({ type: Date, nullable: true }) organizerDecidedAt: Date | null;
  @ApiProperty({ enum: ['ADJUST', 'KEEP', 'REJECT'], nullable: true })
  adminDecision: string | null;
  @ApiProperty({ type: Number, nullable: true }) adminValue: number | null;
  @ApiProperty({ type: String, nullable: true }) adminReason: string | null;
  @ApiProperty({ type: Date, nullable: true }) adminDecidedAt: Date | null;
  @ApiProperty({ enum: CharityAppealOutcomes, nullable: true })
  outcome: string | null;
  @ApiProperty() organizerDueAt: Date;
  @ApiProperty({ type: Date, nullable: true }) appellantDueAt: Date | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ type: Date, nullable: true }) closedAt: Date | null;
}
export class CharityAppealResponseDto {
  @ApiProperty({ type: () => CharityAppealDto }) appeal: CharityAppealDto;
}
export class CharityAppealsResponseDto {
  @ApiProperty({ type: () => [CharityAppealDto] }) appeals: CharityAppealDto[];
}
class CharityAppealEventDto {
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  actorId: string | null;
  @ApiProperty() action: string;
  @ApiProperty({ type: String, nullable: true }) fromStatus: string | null;
  @ApiProperty() toStatus: string;
  @ApiProperty({ type: Number, nullable: true }) value: number | null;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty() createdAt: Date;
}
export class CharityAppealDetailResponseDto {
  @ApiProperty({ type: () => CharityAppealDto }) appeal: CharityAppealDto;
  @ApiProperty({ type: () => [CharityAppealEventDto] })
  events: CharityAppealEventDto[];
}
export class CharityAdminAppealDto extends CharityAppealDto {
  @ApiProperty({ description: 'Số khiếu nại bị Admin bác của người này' })
  appellantRejectedCount: number;
  @ApiProperty({
    description: 'Số lần ban tổ chức (người tạo dự án) bị khiếu nại thành công',
  })
  organizerOverturnedCount: number;
}
export class CharityAdminAppealsResponseDto {
  @ApiProperty({ type: () => [CharityAdminAppealDto] })
  appeals: CharityAdminAppealDto[];
}
