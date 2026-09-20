import {
  ISystemLogEntry,
  SystemLogTypeValues,
  SystemLogTypes,
} from '@/domain/ports/repository';
import { PaginationMetaDto } from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class GetSystemLogsQueryDto {
  @ApiProperty({
    enum: SystemLogTypeValues,
    description:
      'ADMIN: thao tác quản trị. POINT: biến động điểm. RANK: đổi hạng. TRANSACTION: vòng đời tặng/nhận.',
  })
  @IsIn(SystemLogTypeValues)
  logType: SystemLogTypes;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Lọc theo người liên quan. Với giao dịch thì bắt cả vai tặng lẫn vai nhận.',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    example: 'COMPLETED',
    description:
      'Tuỳ loại log: hành động quản trị, mã rule điểm, lý do đổi hạng hoặc trạng thái giao dịch.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  action?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class SystemLogEntryDto implements ISystemLogEntry {
  @ApiProperty({ enum: SystemLogTypeValues }) logType: SystemLogTypes;

  @ApiProperty({ type: String, format: 'date-time' }) occurredAt: Date;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Người gây ra hành động; null khi do hệ thống tự chạy.',
  })
  actorUserId: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  subjectUserId: string | null;

  @ApiProperty({ example: 'COMPLETED' }) action: string;

  @ApiProperty({ example: 'GIFT_TRANSACTION' }) resourceType: string;

  @ApiProperty({ nullable: true }) resourceId: string | null;

  @ApiProperty({ nullable: true }) detail: string | null;
}

export class GetSystemLogsResponseDto {
  @ApiProperty({ type: () => [SystemLogEntryDto] })
  entries: ISystemLogEntry[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}
