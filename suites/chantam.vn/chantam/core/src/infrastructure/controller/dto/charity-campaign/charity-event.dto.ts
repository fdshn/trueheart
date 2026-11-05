import {
  CharityEventStepKeys,
  CharityEventStepStatuses,
  CharityOperationStages,
  CharityPostAuthorRoles,
  CharityPostMediaTypes,
  MaxCharityPostBodyLength,
  MaxCharityPostMedia,
} from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Dự án từ thiện — đợt 3 (CHARITY-PROJECT-LIFECYCLE §3.5). Params khai `id` tại chỗ (xem đợt 2). */

export class CharityProjectStepParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() stepId: string;
}
export class CharityProjectPostParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() postId: string;
}

// ── Timeline ─────────────────────────────────────────────────────────────

export class CharityEventStepPatchDto {
  @ApiPropertyOptional({ enum: CharityEventStepStatuses })
  @IsOptional()
  @IsIn(CharityEventStepStatuses)
  status?: (typeof CharityEventStepStatuses)[number];

  @ApiPropertyOptional({ type: Date, nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  plannedAt?: Date | null;

  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description: 'Bỏ trống khi chuyển `DONE` thì lấy giờ hiện tại',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  actualAt?: Date | null;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}
export class CharityEventStepBodyDto {
  @ApiProperty({ type: () => CharityEventStepPatchDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityEventStepPatchDto)
  step: CharityEventStepPatchDto;
}

export class CharityEventStepsQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Timeline của một đợt trao (§3.18). Bỏ trống = timeline chung của dự án.',
  })
  @IsOptional()
  @IsUUID()
  roundId?: string;
}

export class CharityEventStepViewDto {
  @ApiProperty({ format: 'uuid' }) stepId: string;
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Đợt trao; `null` = timeline chung',
  })
  roundId: string | null;
  @ApiProperty({ enum: CharityEventStepKeys }) stepKey: string;
  @ApiProperty({ example: 'Trao quà' }) label: string;
  @ApiProperty({ enum: CharityEventStepStatuses }) status: string;
  @ApiProperty({ type: Date, nullable: true }) plannedAt: Date | null;
  @ApiProperty({ type: Date, nullable: true }) actualAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) note: string | null;
  @ApiProperty() sortOrder: number;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  updatedBy: string | null;
  @ApiProperty() updatedAt: Date;
}
export class CharityEventStepsResponseDto {
  @ApiProperty({ type: () => [CharityEventStepViewDto] })
  eventSteps: CharityEventStepViewDto[];
}
export class CharityEventStepResponseDto {
  @ApiProperty({ type: () => CharityEventStepViewDto })
  eventStep: CharityEventStepViewDto;
}

// ── Cộng tác viên sự kiện ────────────────────────────────────────────────

export class CharityUserBriefDto {
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty({ type: String, nullable: true }) username: string | null;
  @ApiProperty({ type: String, nullable: true }) fullName: string | null;
  @ApiProperty({ type: String, nullable: true }) avatarUrl: string | null;
}
// ── Bài ảnh/clip ─────────────────────────────────────────────────────────

class CharityQuotaUsageDto {
  @ApiProperty() used: number;
  @ApiProperty() limit: number;
}
export class CharityPostQuotaDto {
  @ApiProperty({ enum: CharityPostAuthorRoles, nullable: true })
  role: string | null;
  @ApiProperty() canPost: boolean;
  @ApiProperty({ type: () => CharityQuotaUsageDto })
  image: CharityQuotaUsageDto;
  @ApiProperty({ type: () => CharityQuotaUsageDto })
  video: CharityQuotaUsageDto;
  @ApiProperty({ description: '0 giờ hôm nay theo giờ Việt Nam' })
  windowStartsAt: Date;
}
export class CharityPostQuotaResponseDto {
  @ApiProperty({ type: () => CharityPostQuotaDto }) quota: CharityPostQuotaDto;
}

class CharityUploadDto {
  @ApiProperty() key: string;
  @ApiProperty() uploadUrl: string;
  @ApiProperty() publicUrl: string;
  @ApiProperty() expiresInSeconds: number;
}
class CharityUploadQuotaDto extends CharityQuotaUsageDto {
  @ApiProperty({ enum: CharityPostMediaTypes }) mediaType: string;
}
export class CharityPostUploadResponseDto {
  @ApiProperty({ type: () => CharityUploadDto }) upload: CharityUploadDto;
  @ApiProperty({ type: () => CharityUploadQuotaDto })
  quota: CharityUploadQuotaDto;
}

export class CharityPostCreateDto {
  @ApiPropertyOptional({ maxLength: MaxCharityPostBodyLength })
  @IsOptional()
  @IsString()
  @MaxLength(MaxCharityPostBodyLength)
  body?: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: MaxCharityPostMedia,
    description: '`upload.key` của các lượt ký `POST :id/posts/media/upload`',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MaxCharityPostMedia)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  mediaKeys?: string[];
}
export class CharityPostCreateBodyDto {
  @ApiProperty({ type: () => CharityPostCreateDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityPostCreateDto)
  post: CharityPostCreateDto;
}

class CharityPostMediaDto {
  @ApiProperty() publicUrl: string;
  @ApiProperty({ enum: CharityPostMediaTypes }) mediaType: string;
  @ApiProperty() sortOrder: number;
}
export class CharityPostDto {
  @ApiProperty({ format: 'uuid' }) postId: string;
  @ApiProperty({ format: 'uuid' }) campaignId: string;
  @ApiProperty({ type: () => CharityUserBriefDto }) author: CharityUserBriefDto;
  @ApiProperty({ enum: CharityPostAuthorRoles }) authorRole: string;
  @ApiProperty({
    enum: CharityOperationStages,
    description: 'Giai đoạn lúc đăng',
  })
  stage: string;
  @ApiProperty({ type: String, nullable: true }) body: string | null;
  @ApiProperty({ type: () => [CharityPostMediaDto] })
  media: CharityPostMediaDto[];
  @ApiProperty() reactionCount: number;
  @ApiProperty({ description: 'Chỉ bình luận đang hiện' })
  commentCount: number;
  @ApiProperty() createdAt: Date;
}
export class CharityPostResponseDto {
  @ApiProperty({ type: () => CharityPostDto }) post: CharityPostDto;
}
export class CharityPostsResponseDto {
  @ApiProperty({ type: () => [CharityPostDto] }) posts: CharityPostDto[];
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  nextBefore: string | null;
}
export class CharityPostsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  before?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
export class CharityDeletedResponseDto {
  @ApiProperty() deleted: boolean;
}
