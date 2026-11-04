import {
  CharityOperationStages,
  CharityRevisionEntities,
  CharityTaskKeys,
  CharityTaskStatuses,
  CharityTaskUpdateModes,
} from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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

/** Dự án từ thiện — đợt 2 (CHARITY-PROJECT-LIFECYCLE §3.3, §3.4, §3.7, §3.13). */

// ── Params / query ───────────────────────────────────────────────────────

// Khai `id` tại chỗ thay vì kế thừa `CharityProjectParamsDto`: file DTO đợt 1 import file này,
// và `extends` một lớp của file đang nạp dở là `extends undefined` lúc chạy.
export class CharityProjectTaskParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() taskId: string;
}
export class CharityProjectExportParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() exportId: string;
}

export class CharityRevisionsQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: '`nextBefore` của trang trước',
  })
  @IsOptional()
  @IsUUID()
  before?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

// ── Checklist tab B ──────────────────────────────────────────────────────

export class CharityTaskPatchDto {
  @ApiPropertyOptional({ enum: CharityTaskStatuses })
  @IsOptional()
  @IsIn(CharityTaskStatuses)
  status?: (typeof CharityTaskStatuses)[number];

  @ApiPropertyOptional({ type: Date, nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledAt?: Date | null;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  workNote?: string | null;

  @ApiPropertyOptional({
    maxLength: 2000,
    nullable: true,
    description: 'Ghi chú NỘI BỘ — không lên bản công khai',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string | null;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  picName?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  picUserId?: string | null;

  @ApiPropertyOptional({ enum: CharityTaskUpdateModes, nullable: true })
  @IsOptional()
  @IsIn(CharityTaskUpdateModes)
  updateMode?: (typeof CharityTaskUpdateModes)[number] | null;
}
export class CharityTaskBodyDto {
  @ApiProperty({ type: () => CharityTaskPatchDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityTaskPatchDto)
  task: CharityTaskPatchDto;
}

export class CharityTaskViewDto {
  @ApiProperty({ format: 'uuid' }) taskId: string;
  @ApiProperty({ enum: CharityTaskKeys }) taskKey: string;
  @ApiProperty({ example: 'Cấp phép, liên hệ' }) label: string;
  @ApiProperty({ enum: CharityTaskStatuses }) status: string;
  @ApiProperty({ type: Date, nullable: true }) scheduledAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) workNote: string | null;
  @ApiProperty({ type: String, nullable: true }) remark: string | null;
  @ApiProperty({ type: String, nullable: true }) picName: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  picUserId: string | null;
  @ApiProperty({ enum: CharityTaskUpdateModes, nullable: true })
  updateMode: string | null;
  @ApiProperty() sortOrder: number;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  updatedBy: string | null;
  @ApiProperty() updatedAt: Date;
}
export class CharityTasksResponseDto {
  @ApiProperty({ type: () => [CharityTaskViewDto] })
  tasks: CharityTaskViewDto[];
}
export class CharityTaskResponseDto {
  @ApiProperty({ type: () => CharityTaskViewDto }) task: CharityTaskViewDto;
}

// ── Lịch sử sửa ──────────────────────────────────────────────────────────

export class CharityChangedFieldDto {
  @ApiProperty({ enum: CharityRevisionEntities }) entity: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Id dòng (bên liên quan, tài khoản, nhu cầu…), khoá bước với `PHASE`, `null` với `CAMPAIGN`',
  })
  entityId: string | null;
  @ApiProperty({
    description: 'Tên field camelCase; `*` khi cả dòng được thêm/xoá',
  })
  field: string;
  @ApiProperty() changedAt: Date;
}

export class CharityRevisionDto {
  @ApiProperty({ format: 'uuid' }) revisionId: string;
  @ApiProperty({ enum: CharityRevisionEntities }) entity: string;
  @ApiProperty({ type: String, nullable: true }) entityId: string | null;
  @ApiProperty() field: string;
  @ApiProperty({ nullable: true, description: 'Giá trị cũ (JSON)' })
  oldValue: unknown;
  @ApiProperty({ nullable: true, description: 'Giá trị mới (JSON)' })
  newValue: unknown;
  @ApiProperty() isPublic: boolean;
  @ApiProperty({
    description: 'Thay đổi quan trọng — đã báo người theo dõi',
  })
  isImportant: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Luôn `null` ở changelog công khai',
  })
  changedBy: string | null;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty() createdAt: Date;
}
export class CharityRevisionsResponseDto {
  @ApiProperty({ type: () => [CharityRevisionDto] })
  revisions: CharityRevisionDto[];
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  nextBefore: string | null;
}

// ── Tương tác, thống kê ──────────────────────────────────────────────────

export class CharityCountersDto {
  @ApiProperty() reactionCount: number;
  @ApiProperty({ description: 'Chỉ bình luận đang hiện' })
  commentCount: number;
  @ApiProperty({ description: 'Số người bấm quan tâm' })
  followerCount: number;
}

export class CharityFollowDto {
  @ApiProperty() following: boolean;
  @ApiProperty() followerCount: number;
}
export class CharityFollowResponseDto {
  @ApiProperty({ type: () => CharityFollowDto }) follow: CharityFollowDto;
}

class CharityItemTotalsDto {
  @ApiProperty() target: number;
  @ApiProperty({ description: 'Đề nghị đang chờ quyết' }) registered: number;
  @ApiProperty() approved: number;
  @ApiProperty() receivedInApp: number;
  @ApiProperty() receivedExternal: number;
  @ApiProperty() remaining: number;
}
class CharityFundingTotalsDto {
  @ApiProperty() target: number;
  @ApiProperty() confirmed: number;
  @ApiProperty() external: number;
  @ApiProperty() remaining: number;
}
class CharityVolunteerTotalsDto {
  @ApiProperty() needed: number;
  @ApiProperty() confirmed: number;
  @ApiProperty() remaining: number;
}
export class CharityNeedTotalsDto {
  @ApiProperty({ type: () => CharityItemTotalsDto })
  items: CharityItemTotalsDto;
  @ApiProperty({ type: () => CharityFundingTotalsDto })
  funding: CharityFundingTotalsDto;
  @ApiProperty({ type: () => CharityVolunteerTotalsDto })
  volunteers: CharityVolunteerTotalsDto;
}

export class CharityPublicStatsDto extends CharityCountersDto {
  @ApiProperty({ description: 'Người có đóng góp được chấp nhận' })
  supporterCount: number;
  @ApiProperty({
    description: 'Đăng ký tham gia còn hiệu lực + người tuyển đã xác nhận',
  })
  participantCount: number;
  @ApiProperty({ type: () => CharityNeedTotalsDto })
  needs: CharityNeedTotalsDto;
}
export class CharityPublicStatsResponseDto {
  @ApiProperty({ type: () => CharityPublicStatsDto })
  stats: CharityPublicStatsDto;
}

class CharityContributionStatsDto {
  @ApiProperty() pendingReview: number;
  @ApiProperty() accepted: number;
  @ApiProperty() partiallyAccepted: number;
  @ApiProperty() rejected: number;
  @ApiProperty() withdrawn: number;
  @ApiProperty() acceptedContributors: number;
}
class CharityRegisteredCancelledDto {
  @ApiProperty() registered: number;
  @ApiProperty() cancelled: number;
}
class CharityVolunteerStatsDto extends CharityRegisteredCancelledDto {
  @ApiProperty() confirmed: number;
}
class CharityReportStatsDto {
  @ApiProperty({ description: 'Đang chờ hoặc đang xem' }) open: number;
  @ApiProperty() total: number;
}
export class CharityInternalStatsDto extends CharityCountersDto {
  @ApiProperty({ type: () => CharityContributionStatsDto })
  contributions: CharityContributionStatsDto;
  @ApiProperty({ type: () => CharityRegisteredCancelledDto })
  participants: CharityRegisteredCancelledDto;
  @ApiProperty({ type: () => CharityVolunteerStatsDto })
  volunteers: CharityVolunteerStatsDto;
  @ApiProperty({ type: () => CharityReportStatsDto })
  reports: CharityReportStatsDto;
  @ApiProperty({ description: 'Số lượt tạo link chia sẻ' }) shares: number;
  @ApiProperty({ type: () => CharityNeedTotalsDto })
  needs: CharityNeedTotalsDto;
}
export class CharityInternalStatsResponseDto {
  @ApiProperty({ type: () => CharityInternalStatsDto })
  stats: CharityInternalStatsDto;
}

// ── Bản in, chia sẻ ──────────────────────────────────────────────────────

export class CharityExportCreateDto {
  @ApiPropertyOptional({
    enum: CharityOperationStages,
    description: 'Bỏ trống = in cả dự án',
  })
  @IsOptional()
  @IsIn(CharityOperationStages)
  sectionKey?: (typeof CharityOperationStages)[number];
}
export class CharityExportCreateBodyDto {
  @ApiPropertyOptional({ type: () => CharityExportCreateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CharityExportCreateDto)
  export?: CharityExportCreateDto;
}

export class CharityExportViewDto {
  @ApiProperty({ format: 'uuid' }) exportId: string;
  @ApiProperty({ enum: CharityOperationStages, nullable: true })
  sectionKey: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uuid',
    description:
      'Revision cuối lúc tạo — so với changelog để biết bản in cũ hay mới',
  })
  lastRevisionId: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  generatedBy: string | null;
  @ApiProperty() generatedAt: Date;
  @ApiProperty({
    example: '/charity-campaigns/<id>/exports/<exportId>/pdf',
    description: 'Ghép sau `/api/v1`; cần token',
  })
  downloadPath: string;
}
export class CharityExportResponseDto {
  @ApiProperty({ type: () => CharityExportViewDto })
  export: CharityExportViewDto;
}
export class CharityExportsResponseDto {
  @ApiProperty({ type: () => [CharityExportViewDto] })
  exports: CharityExportViewDto[];
}

export class CharityShareCreateDto {
  @ApiPropertyOptional({
    enum: CharityOperationStages,
    description: 'Chia sẻ một mục ĐÃ công khai; bỏ trống = cả dự án',
  })
  @IsOptional()
  @IsIn(CharityOperationStages)
  sectionKey?: (typeof CharityOperationStages)[number];

  @ApiPropertyOptional({ maxLength: 40, example: 'ZALO' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  channel?: string;
}
export class CharityShareCreateBodyDto {
  @ApiPropertyOptional({ type: () => CharityShareCreateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CharityShareCreateDto)
  share?: CharityShareCreateDto;
}
export class CharityShareLinkDto {
  @ApiProperty({ enum: CharityOperationStages, nullable: true })
  sectionKey: string | null;
  @ApiProperty({ example: '/c/ao-am-vung-cao?section=EXECUTION' })
  sharePath: string;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://chantam.vn/c/ao-am-vung-cao',
    description: '`null` khi máy chủ chưa cấu hình `WEB_PUBLIC_BASE_URL`',
  })
  shareUrl: string | null;
}
export class CharityShareLinkResponseDto {
  @ApiProperty({ type: () => CharityShareLinkDto }) share: CharityShareLinkDto;
}
