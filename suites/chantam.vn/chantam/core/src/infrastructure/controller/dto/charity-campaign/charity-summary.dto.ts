import {
  CharityEvaluationSources,
  CharityFeaturedCtas,
} from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CharityUserBriefDto } from './charity-event.dto';

/** Dự án từ thiện — đợt 4a (CHARITY-PROJECT-LIFECYCLE §3.6, §3.14, §3.17). */

export class CharityProjectReportParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() reportId: string;
}
export class CharityProjectUserParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() userId: string;
}
export class CharityProjectContributionParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() contributionId: string;
}

// ── Tổng kết ─────────────────────────────────────────────────────────────

export class CharitySummaryContentDto {
  @ApiPropertyOptional({ maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  summary?: string | null;

  @ApiPropertyOptional({
    maxLength: 5000,
    nullable: true,
    description: 'Sử dụng tiền/vật phẩm',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  usageReport?: string | null;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  thanksMessage?: string | null;

  @ApiPropertyOptional({ maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  lessonsLearned?: string | null;

  @ApiPropertyOptional({ type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  evidenceUrls?: string[];
}
export class CharitySummaryBodyDto {
  @ApiProperty({ type: () => CharitySummaryContentDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharitySummaryContentDto)
  summary: CharitySummaryContentDto;
}

export class CharitySummaryViewDto {
  @ApiProperty({ type: String, nullable: true }) summary: string | null;
  @ApiProperty({ type: String, nullable: true }) usageReport: string | null;
  @ApiProperty({ type: String, nullable: true }) thanksMessage: string | null;
  @ApiProperty({ type: String, nullable: true }) lessonsLearned: string | null;
  @ApiProperty({ type: [String] }) evidenceUrls: string[];
  @ApiProperty({ type: Date, nullable: true }) publishedAt: Date | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  updatedBy: string | null;
  @ApiProperty() updatedAt: Date;
}
export class CharitySummaryResponseDto {
  @ApiProperty({ type: () => CharitySummaryViewDto })
  summary: CharitySummaryViewDto;
}

export class CharityFinancialReportDto {
  @ApiProperty({ example: '2026-11-01', description: 'YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  periodFrom: string;

  @ApiProperty({ example: '2026-11-30' })
  @IsISO8601({ strict: true })
  periodTo: string;

  @ApiProperty({ description: 'VNĐ' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalIncome: number;

  @ApiProperty({ description: 'VNĐ' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalExpense: number;

  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @Length(1, 5000)
  explanation: string;

  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 20,
    description: 'Sao kê / chứng từ (URL https) — bắt buộc',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  statementUrls: string[];
}
export class CharityFinancialReportBodyDto {
  @ApiProperty({ type: () => CharityFinancialReportDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityFinancialReportDto)
  report: CharityFinancialReportDto;
}
export class CharityFinancialReportViewDto extends CharityFinancialReportDto {
  @ApiProperty({ format: 'uuid' }) reportId: string;
  @ApiProperty({ description: 'Thu − chi (database tính)' }) balance: number;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  updatedBy: string | null;
  @ApiProperty() updatedAt: Date;
}
export class CharityFinancialReportResponseDto {
  @ApiProperty({ type: () => CharityFinancialReportViewDto })
  report: CharityFinancialReportViewDto;
}
export class CharitySummaryBoardResponseDto {
  @ApiProperty({ type: () => CharitySummaryViewDto, nullable: true })
  summary: CharitySummaryViewDto | null;
  @ApiProperty({ type: () => [CharityFinancialReportViewDto] })
  financialReports: CharityFinancialReportViewDto[];
  @ApiProperty({
    description: 'Có nhận tiền → cần ít nhất một báo cáo trước khi công khai',
  })
  financialReportRequired: boolean;
}

export class CharityPublicSupportersDto {
  @ApiProperty() supporterCount: number;
  @ApiProperty() participantCount: number;
  @ApiProperty({
    type: [String],
    description: 'Nickname người cho phép hiện (tối đa 200)',
  })
  supporters: string[];
  @ApiProperty({ type: [String] }) participants: string[];
}

// ── Chấm mức hoàn thành ──────────────────────────────────────────────────

export class CharityEvaluationDto {
  @ApiProperty({ minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  completionScore: number;

  @ApiPropertyOptional({
    maxLength: 1000,
    description: 'Nội bộ — người được chấm không thấy',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
export class CharityEvaluationBodyDto {
  @ApiProperty({ type: () => CharityEvaluationDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityEvaluationDto)
  evaluation: CharityEvaluationDto;
}
export class CharityEvaluationViewDto {
  @ApiProperty({ format: 'uuid' }) evaluationId: string;
  @ApiProperty({ type: () => CharityUserBriefDto })
  participant: CharityUserBriefDto;
  @ApiProperty() completionScore: number;
  @ApiProperty({ type: String, nullable: true }) note: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  evaluatedBy: string | null;
  @ApiProperty({ enum: CharityEvaluationSources }) source: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ description: 'Lần chấm thứ mấy' }) version: number;
}
export class CharityEvaluationResponseDto {
  @ApiProperty({ type: () => CharityEvaluationViewDto })
  evaluation: CharityEvaluationViewDto;
}
export class CharityEvaluationBoardResponseDto {
  @ApiProperty({ type: () => [CharityEvaluationViewDto] })
  evaluations: CharityEvaluationViewDto[];
  @ApiProperty({ type: () => [CharityUserBriefDto] })
  candidates: CharityUserBriefDto[];
}
export class CharityMyEvaluationDto {
  @ApiProperty({ format: 'uuid' }) evaluationId: string;
  @ApiProperty() completionScore: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() version: number;
}
export class CharityMyEvaluationResponseDto {
  @ApiProperty({ type: () => CharityMyEvaluationDto, nullable: true })
  evaluation: CharityMyEvaluationDto | null;
}

// ── Nickname ─────────────────────────────────────────────────────────────

export class CharityPublicNameDto {
  @ApiProperty({
    type: Boolean,
    nullable: true,
    description: '`null` = theo cài đặt chung `showInPublicSupporterLists`',
  })
  @IsOptional()
  @IsBoolean()
  show: boolean | null;
}
export class CharityPublicNameBodyDto {
  @ApiProperty({ type: () => CharityPublicNameDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityPublicNameDto)
  publicName: CharityPublicNameDto;
}
export class CharityUpdatedResponseDto {
  @ApiProperty() updated: boolean;
}

// ── Card Home ────────────────────────────────────────────────────────────

export class CharityPromotionRequestDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
export class CharityPromotionRequestBodyDto {
  @ApiPropertyOptional({ type: () => CharityPromotionRequestDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CharityPromotionRequestDto)
  promotion?: CharityPromotionRequestDto;
}

export class CharityPromotionSetDto {
  @ApiProperty() @IsBoolean() featuredOnHome: boolean;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  featuredTitle?: string | null;

  @ApiPropertyOptional({ maxLength: 300, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  featuredMessage?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Bỏ trống = ảnh bìa dự án',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  featuredMediaUrl?: string | null;

  @ApiPropertyOptional({ enum: CharityFeaturedCtas, nullable: true })
  @IsOptional()
  @IsIn(CharityFeaturedCtas)
  featuredCta?: (typeof CharityFeaturedCtas)[number] | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  featuredFrom?: Date | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  featuredUntil?: Date | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 1000, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  featuredPriority?: number;

  @ApiProperty({ maxLength: 500, description: 'Lý do (audit)' })
  @IsString()
  @Length(1, 500)
  reason: string;
}
export class CharityPromotionSetBodyDto {
  @ApiProperty({ type: () => CharityPromotionSetDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityPromotionSetDto)
  promotion: CharityPromotionSetDto;
}
export class CharityPromotionViewDto {
  @ApiProperty() featuredOnHome: boolean;
  @ApiProperty({ type: String, nullable: true }) featuredTitle: string | null;
  @ApiProperty({ type: String, nullable: true }) featuredMessage: string | null;
  @ApiProperty({ type: String, nullable: true }) featuredMediaUrl:
    string | null;
  @ApiProperty({ enum: CharityFeaturedCtas, nullable: true })
  featuredCta: string | null;
  @ApiProperty({ type: Date, nullable: true }) featuredFrom: Date | null;
  @ApiProperty({ type: Date, nullable: true }) featuredUntil: Date | null;
  @ApiProperty() featuredPriority: number;
  @ApiProperty({ type: Date, nullable: true })
  promotionRequestedAt: Date | null;
  @ApiProperty({ type: String, nullable: true })
  promotionRequestNote: string | null;
}
export class CharityPromotionResponseDto {
  @ApiProperty({ type: () => CharityPromotionViewDto })
  promotion: CharityPromotionViewDto;
}

export class CharityHomeCardDto {
  @ApiProperty({ format: 'uuid' }) campaignId: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty({ type: String, nullable: true }) message: string | null;
  @ApiProperty({ type: String, nullable: true }) mediaUrl: string | null;
  @ApiProperty({ enum: CharityFeaturedCtas }) cta: string;
  @ApiProperty() priority: number;
}
export class CharityHomeCardsResponseDto {
  @ApiProperty({ type: () => [CharityHomeCardDto] })
  cards: CharityHomeCardDto[];
}
export class CharityHomeCardsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
