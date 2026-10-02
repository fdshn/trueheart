import {
  ReportReasons,
  ReportStatuses,
  ReportTargetTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  ICreateReportBodyDto,
  ICreateReportDto,
  IReportDto,
  IReviewReportBodyDto,
  IReviewReportDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  MaxReportSuspendDays,
  ReportEnforcementAction,
  ReportEnforcementActions,
} from '@chantam.vn/chantam.core-lib/models';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Mixin } from 'ts-mixer';

export class CreateReportDto implements ICreateReportDto {
  @ApiProperty({ enum: ReportTargetTypes })
  @IsEnum(ReportTargetTypes)
  targetType: ReportTargetTypes;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetId: string;

  @ApiProperty({ enum: ReportReasons })
  @IsEnum(ReportReasons)
  reason: ReportReasons;

  @ApiProperty()
  @IsString()
  @Length(10, 1000)
  description: string;

  @ApiPropertyOptional({ type: [String], maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({}, { each: true })
  evidenceUrls?: string[];
}

export class CreateReportBodyDto implements ICreateReportBodyDto {
  @ApiProperty({ type: () => CreateReportDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateReportDto)
  report: CreateReportDto;
}

export class AdminReportParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  reportId: string;
}

export class ListReporterStatsQueryDto {
  @ApiPropertyOptional({
    default: true,
    description:
      'Mặc định CHỈ trả người đã vượt ngưỡng. Mở ra thấy mọi người từng báo xấu thì không ai đọc hết, và cái cần xem sẽ nằm lẫn trong đó. Đặt `false` để xem toàn bộ.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  abusiveOnly?: boolean;

  @ApiPropertyOptional({ default: 100, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class ReporterStatsDto {
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty() username: string;

  @ApiProperty({ description: 'Tổng lượt báo, kể cả đang chờ xử lý.' })
  totalReports: number;

  @ApiProperty({
    description:
      'Số lượt ĐÃ có kết luận — mẫu để tính tỷ lệ. Người vừa gửi 20 báo còn đang chờ không phải người báo bừa, họ chỉ là người đang chờ.',
  })
  reviewedReports: number;

  @ApiProperty() dismissedReports: number;
  @ApiProperty() resolvedReports: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Phần trăm bị bác trên số lượt đã có kết luận.',
  })
  dismissedRatioPercent: number | null;

  @ApiProperty({
    description:
      '`true` khi đủ mẫu VÀ vượt ngưỡng. KHÔNG tự động phạt — chỉ đưa hồ sơ lên bàn Admin, y như cờ Giver Accuracy.',
  })
  abusive: boolean;
}

export class ListReporterStatsResponseDto {
  @ApiProperty({ type: () => [ReporterStatsDto] })
  reporters: ReporterStatsDto[];

  @ApiProperty({ description: 'Ngưỡng số mẫu đang áp (`report.abuse`).' })
  minReports: number;

  @ApiProperty({ description: 'Ngưỡng tỷ lệ bị bác đang áp.' })
  dismissedRatioPercent: number;
}

export class ListAdminReportsQueryDto extends Mixin(PaginationQueryDto) {
  @ApiPropertyOptional({
    enum: ReportStatuses,
    default: ReportStatuses.PENDING,
  })
  @IsOptional()
  @IsEnum(ReportStatuses)
  status?: ReportStatuses;

  @ApiPropertyOptional({ enum: ReportTargetTypes })
  @IsOptional()
  @IsEnum(ReportTargetTypes)
  targetType?: ReportTargetTypes;

  @ApiPropertyOptional({ enum: ReportReasons })
  @IsOptional()
  @IsEnum(ReportReasons)
  reason?: ReportReasons;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  keyword?: string;
}

export class ReportDto implements IReportDto {
  @ApiProperty({ format: 'uuid' }) reportId: string;
  @ApiProperty({ format: 'uuid' }) reporterUserId: string;
  @ApiProperty() reporterUsername: string;
  @ApiProperty({ enum: ReportTargetTypes }) targetType: ReportTargetTypes;
  @ApiProperty({ format: 'uuid' }) targetId: string;
  @ApiProperty() targetLabel: string;
  @ApiProperty({ enum: ReportReasons }) reason: ReportReasons;
  @ApiProperty() description: string;
  @ApiProperty({ type: [String] }) evidenceUrls: string[];
  @ApiProperty({ enum: ReportStatuses }) status: ReportStatuses;
  @ApiProperty() targetOpenReportCount: number;
  @ApiProperty({ format: 'uuid', nullable: true }) reviewedByUserId:
    string | null;
  @ApiProperty({ nullable: true }) reviewNote: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  reviewedAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: Date;
}

export class CreateReportResponseDto {
  @ApiProperty({ type: () => ReportDto }) report: IReportDto;
}

export class ListAdminReportsResponseDto {
  @ApiProperty({ type: () => [ReportDto] }) reports: IReportDto[];
  @ApiProperty({ type: () => PaginationMetaDto }) meta: PaginationMetaDto;
}

export class GetAdminReportResponseDto {
  @ApiProperty({ type: () => ReportDto }) report: IReportDto;
}

export class ReviewReportDto implements IReviewReportDto {
  @ApiProperty({ enum: [ReportStatuses.RESOLVED, ReportStatuses.DISMISSED] })
  @IsEnum([ReportStatuses.RESOLVED, ReportStatuses.DISMISSED])
  status: ReportStatuses.RESOLVED | ReportStatuses.DISMISSED;

  @ApiProperty()
  @IsString()
  @Length(3, 1000)
  note: string;
}

export class ReportEnforcementDto {
  @ApiProperty({
    enum: ReportEnforcementActions,
    description:
      '`NONE` là mặc định và là hành vi của đường cũ. `SUSPEND_USER` đòi `suspendDays`. `BAN_USER` khoá vĩnh viễn. Gỡ/ẩn bài viết KHÔNG ở đây — đường đó là `PATCH /admin/posts/:postId/moderate`, với bộ trạng thái và luật riêng.',
  })
  @IsIn(ReportEnforcementActions as readonly string[])
  action: ReportEnforcementAction;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MaxReportSuspendDays,
    example: 7,
    description:
      'Bắt buộc với `SUSPEND_USER`, bỏ qua với mọi giá trị khác. Trần 365 ngày: treo 10 năm là khoá vĩnh viễn viết bằng một cách khác, và tệ hơn vì bản ghi nói "tạm" nên không ai đi soát lại.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MaxReportSuspendDays)
  suspendDays?: number | null;
}

export class ReviewReportBodyDto implements IReviewReportBodyDto {
  @ApiProperty({ type: () => ReviewReportDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ReviewReportDto)
  review: ReviewReportDto;

  @ApiPropertyOptional({
    type: () => ReportEnforcementDto,
    description:
      'Chế tài áp CÙNG LÚC với kết luận (F49, mục mở L4). Bỏ trống nghĩa là không chế tài. Chỉ hợp lệ khi `review.status` là `RESOLVED` — bác báo xấu rồi khoá người bị báo là ghi vào sổ hai câu trái nhau.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReportEnforcementDto)
  enforcement?: ReportEnforcementDto;
}

export class ReportEnforcementOutcomeDto {
  @ApiProperty({ enum: ReportEnforcementActions })
  action: ReportEnforcementAction;

  @ApiProperty({
    nullable: true,
    description:
      'Tài khoản đã bị áp chế tài. Với báo xấu nhắm vào nội dung thì đây là CHỦ nội dung — chính việc mà trước bản này Admin phải tự đi tìm tay.',
  })
  targetUserId: string | null;

  @ApiProperty({ nullable: true }) userStatus: string | null;
  @ApiProperty({ nullable: true }) suspendedUntil: Date | null;

  @ApiProperty({
    description:
      'Số phiên đã bị thu hồi. ROADMAP ghi rõ "chế tài nào đổi `status` thì cũng phải thu hồi token", nên con số này là BẰNG CHỨNG việc đó đã xảy ra, không phải một lời hứa trong docblock.',
  })
  revokedSessions: number;
}

export class ReviewReportResponseDto {
  @ApiProperty({ type: () => ReportDto }) report: IReportDto;

  @ApiProperty({
    type: () => ReportEnforcementOutcomeDto,
    description:
      'Luôn có mặt, kể cả khi không chế tài gì (`action: "NONE"`). Trả `undefined` ở ca không chế tài sẽ buộc client phân biệt "không áp" với "thiếu trường" — hai chuyện khác nhau khi đọc lại một response cũ.',
  })
  enforcement: ReportEnforcementOutcomeDto;
}
