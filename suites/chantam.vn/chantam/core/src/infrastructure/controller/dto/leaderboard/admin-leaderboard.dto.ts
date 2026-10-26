import {
  LeaderboardBoards,
  LeaderboardMonthPattern,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IAdminBadgeDto,
  IAdminLeaderboardEntryDto,
  IAdminMonthlyLeaderboardDto,
  ILeaderboardExclusionDto,
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
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Mixin } from 'ts-mixer';
import {
  LeaderboardEntryDto,
  MonthlyLeaderboardDto,
  ProfileBadgeDto,
} from './leaderboard.dto';

// Cùng khoảng năm với `parseLeaderboardMonth` — năm 0000 là 500 ở `::date`.
const MonthPattern = LeaderboardMonthPattern;
const MonthMessage = 'phải có dạng YYYY-MM';
/** Có ít nhất một ký tự không phải khoảng trắng — năm dấu cách không phải là lý do. */
const NotBlankPattern = /\S/;

// Trường khai trực tiếp trên từng lớp, KHÔNG trộn qua `Mixin`: ts-mixer chỉ chép decorator
// bọc bằng `decorate()`, và trường mất decorator bị `whitelist` gạt đi (xem leaderboard.dto.spec).
export class AdminMonthlyLeaderboardQueryDto extends Mixin(PaginationQueryDto) {
  @ApiProperty({ enum: LeaderboardBoards })
  @IsEnum(LeaderboardBoards)
  board: LeaderboardBoards;

  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @IsString()
  month?: string;
}

export class ListLeaderboardExclusionsQueryDto extends Mixin(
  PaginationQueryDto,
) {
  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @Matches(MonthPattern, { message: MonthMessage })
  month?: string;

  @ApiPropertyOptional({
    enum: LeaderboardBoards,
    description: 'Lọc theo bảng; lượt loại "mọi bảng" luôn có mặt.',
  })
  @IsOptional()
  @IsEnum(LeaderboardBoards)
  board?: LeaderboardBoards;
}

export class ListAdminBadgesQueryDto extends Mixin(PaginationQueryDto) {
  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @Matches(MonthPattern, { message: MonthMessage })
  month?: string;

  @ApiPropertyOptional({ enum: LeaderboardBoards })
  @IsOptional()
  @IsEnum(LeaderboardBoards)
  board?: LeaderboardBoards;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class CreateLeaderboardExclusionDto {
  @ApiProperty({ example: '2026-10', description: 'Tháng CHƯA chốt.' })
  @Matches(MonthPattern, { message: MonthMessage })
  month: string;

  @ApiPropertyOptional({
    enum: LeaderboardBoards,
    nullable: true,
    description: 'Bỏ trống hoặc `null` = loại khỏi CẢ BA bảng.',
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsEnum(LeaderboardBoards)
  board?: LeaderboardBoards | null;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId: string;

  @ApiProperty({ minLength: 5, maxLength: 500 })
  @IsString()
  @Length(5, 500)
  @Matches(NotBlankPattern, { message: 'không được để trống' })
  reason: string;
}

export class CreateLeaderboardExclusionBodyDto {
  @ApiProperty({ type: () => CreateLeaderboardExclusionDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateLeaderboardExclusionDto)
  exclusion: CreateLeaderboardExclusionDto;
}

export class RevokeBadgeDto {
  @ApiProperty({ minLength: 5, maxLength: 500 })
  @IsString()
  @Length(5, 500)
  @Matches(NotBlankPattern, { message: 'không được để trống' })
  reason: string;
}

export class RevokeBadgeBodyDto {
  @ApiProperty({ type: () => RevokeBadgeDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => RevokeBadgeDto)
  revoke: RevokeBadgeDto;
}

export class ExclusionIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  exclusionId: string;
}

export class BadgeIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  badgeId: string;
}

export class AdminLeaderboardEntryDto
  extends LeaderboardEntryDto
  implements IAdminLeaderboardEntryDto
{
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ description: 'Đang bị loại khỏi bảng này (tháng chưa chốt).' })
  excluded: boolean;
}

export class AdminMonthlyLeaderboardDto implements IAdminMonthlyLeaderboardDto {
  @ApiProperty({ example: '2026-10' })
  month: string;

  @ApiProperty({ enum: LeaderboardBoards })
  board: LeaderboardBoards;

  @ApiProperty({ enum: ['LIVE', 'CLOSED'] })
  status: MonthlyLeaderboardDto['status'];

  @ApiProperty()
  enabled: boolean;

  @ApiProperty({ type: Date, nullable: true })
  closedAt: Date | null;

  @ApiProperty({ type: () => [AdminLeaderboardEntryDto] })
  entries: IAdminLeaderboardEntryDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class LeaderboardExclusionDto implements ILeaderboardExclusionDto {
  @ApiProperty({ format: 'uuid' }) exclusionId: string;
  @ApiProperty({ example: '2026-10' }) month: string;
  @ApiProperty({ enum: LeaderboardBoards, nullable: true })
  board: LeaderboardBoards | null;
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty() reason: string;
  @ApiProperty({ format: 'uuid' }) createdBy: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ type: Date, nullable: true }) removedAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) removedBy: string | null;
}

export class LeaderboardExclusionWrapperDto {
  @ApiProperty({ type: () => LeaderboardExclusionDto })
  exclusion: ILeaderboardExclusionDto;
}

export class ListLeaderboardExclusionsResponseDto {
  @ApiProperty({ type: () => [LeaderboardExclusionDto] })
  items: ILeaderboardExclusionDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class AdminBadgeDto extends ProfileBadgeDto implements IAdminBadgeDto {
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty() awardedAt: Date;
  @ApiProperty({ type: String, nullable: true }) revokeReason: string | null;
}

export class AdminBadgeWrapperDto {
  @ApiProperty({ type: () => AdminBadgeDto })
  badge: IAdminBadgeDto;
}

export class ListAdminBadgesResponseDto {
  @ApiProperty({ type: () => [AdminBadgeDto] })
  items: IAdminBadgeDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}
