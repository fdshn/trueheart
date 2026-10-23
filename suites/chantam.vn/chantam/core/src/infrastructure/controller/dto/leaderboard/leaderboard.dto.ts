import {
  LeaderboardBoards,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  ILeaderboardEntryDto,
  ILeaderboardMonthsDto,
  ILeaderboardUserDto,
  IMonthlyLeaderboardDto,
  IMyLeaderboardPositionDto,
  IMyLeaderboardPositionsDto,
  LeaderboardStatus,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Mixin } from 'ts-mixer';

const MonthDescription =
  'Tháng `YYYY-MM` theo giờ Việt Nam. Bỏ trống = tháng hiện tại. Sai dạng trả 400.';

export class LeaderboardMonthQueryDto {
  @ApiPropertyOptional({ example: '2026-10', description: MonthDescription })
  @IsOptional()
  @IsString()
  month?: string;
}

// `month` khai lại ở đây chứ không trộn `LeaderboardMonthQueryDto` vào `Mixin`: ts-mixer chỉ
// chép decorator bọc bằng `decorate()`, và trường mất decorator bị `whitelist` gạt đi.
export class GetMonthlyLeaderboardQueryDto extends Mixin(PaginationQueryDto) {
  @ApiPropertyOptional({ example: '2026-10', description: MonthDescription })
  @IsOptional()
  @IsString()
  month?: string;

  @ApiProperty({
    enum: LeaderboardBoards,
    description:
      '`GIVERS` = lượt tặng hoàn tất, `CHARITY` = lượt đóng góp từ thiện có thực nhận, `CONSISTENCY` = ngày điểm danh (không tính ngày bù).',
  })
  @IsEnum(LeaderboardBoards)
  board: LeaderboardBoards;
}

export class LeaderboardUserDto implements ILeaderboardUserDto {
  @ApiProperty()
  username: string;

  @ApiProperty({ type: String, nullable: true })
  fullName: string | null;

  @ApiProperty({ type: String, nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ enum: UserRanks })
  rank: UserRanks;
}

export class LeaderboardEntryDto implements ILeaderboardEntryDto {
  @ApiProperty({ example: 1 })
  rank: number;

  @ApiProperty({
    example: 4,
    description: 'Số lần trong tháng (lượt hoặc ngày).',
  })
  count: number;

  @ApiProperty({ description: 'Hiện "Người ẩn danh" — `user` là `null`.' })
  isAnonymous: boolean;

  @ApiProperty({
    description:
      'Tài khoản bị khoá/xoá sau khi chốt — hiện "Tài khoản không còn hoạt động", `user` là `null`.',
  })
  isInactive: boolean;

  @ApiProperty({ type: () => LeaderboardUserDto, nullable: true })
  user: ILeaderboardUserDto | null;
}

export class MonthlyLeaderboardDto implements IMonthlyLeaderboardDto {
  @ApiProperty({ example: '2026-10' })
  month: string;

  @ApiProperty({ enum: LeaderboardBoards })
  board: LeaderboardBoards;

  @ApiProperty({
    enum: ['LIVE', 'CLOSED'],
    description:
      '`LIVE` = tháng chưa chốt, số liệu còn đổi; `CLOSED` = đã chốt, cố định.',
  })
  status: LeaderboardStatus;

  @ApiProperty({
    description: '`false` = Admin đang tắt tính năng; `entries` rỗng.',
  })
  enabled: boolean;

  @ApiProperty({ type: Date, nullable: true })
  closedAt: Date | null;

  @ApiProperty({ type: () => [LeaderboardEntryDto] })
  entries: ILeaderboardEntryDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;

  @ApiProperty({
    type: () => LeaderboardEntryDto,
    nullable: true,
    description:
      'Dòng của người gọi (khi gửi kèm token), luôn có danh tính của CHÍNH họ kể cả khi đang ẩn danh.',
  })
  me: ILeaderboardEntryDto | null;
}

export class MyLeaderboardPositionDto implements IMyLeaderboardPositionDto {
  @ApiProperty({ enum: LeaderboardBoards })
  board: LeaderboardBoards;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: '`null` khi chưa đủ sàn.',
  })
  rank: number | null;

  @ApiProperty()
  count: number;

  @ApiProperty({ description: 'Sàn tối thiểu để lên bảng này.' })
  minCount: number;

  @ApiProperty({ description: 'Số hạng đầu nhận huy hiệu.' })
  badgeRanks: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Còn thiếu bao nhiêu để bằng hạng cuối nhận huy hiệu.',
  })
  gapToBadge: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Còn thiếu bao nhiêu để bằng người ngay trên.',
  })
  gapToNext: number | null;
}

export class MyLeaderboardPositionsDto implements IMyLeaderboardPositionsDto {
  @ApiProperty({ example: '2026-10' })
  month: string;

  @ApiProperty({ enum: ['LIVE', 'CLOSED'] })
  status: LeaderboardStatus;

  @ApiProperty()
  enabled: boolean;

  @ApiProperty({ type: () => [MyLeaderboardPositionDto] })
  positions: IMyLeaderboardPositionDto[];
}

export class LeaderboardMonthsDto implements ILeaderboardMonthsDto {
  @ApiProperty({ type: [String], example: ['2026-10', '2026-09'] })
  months: string[];
}
