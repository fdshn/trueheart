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
  PaginationMetaDto,
  PaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
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

export class ReviewReportBodyDto implements IReviewReportBodyDto {
  @ApiProperty({ type: () => ReviewReportDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ReviewReportDto)
  review: ReviewReportDto;
}

export class ReviewReportResponseDto {
  @ApiProperty({ type: () => ReportDto }) report: IReportDto;
}
