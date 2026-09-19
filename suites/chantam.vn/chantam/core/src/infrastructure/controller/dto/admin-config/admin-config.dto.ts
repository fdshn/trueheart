import {
  IAdminAuditSummary,
  ISystemConfigSummary,
} from '@/domain/ports/repository';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class PublishSystemConfigDto {
  @ApiProperty({ example: 'discovery.default_radius_meters' })
  @IsString()
  key: string;

  @ApiProperty({ example: 5000 })
  @IsDefined()
  value: unknown;

  @ApiProperty({ example: 'INTEGER' })
  @IsString()
  valueType: string;

  @ApiProperty({ example: 'Điều chỉnh bán kính mặc định' })
  @IsString()
  reason: string;
}

export class PublishSystemConfigBodyDto {
  @ApiProperty({ type: () => PublishSystemConfigDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PublishSystemConfigDto)
  systemConfig: PublishSystemConfigDto;
}

export class GetAdminAuditLogsQueryDto {
  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class SystemConfigDto implements ISystemConfigSummary {
  @ApiProperty({ example: 12 }) id: number;

  @ApiProperty({ example: 'discovery.default_radius_meters' }) key: string;

  @ApiProperty({
    nullable: true,
    description: 'Giá trị đang hiệu lực. Luôn null với cấu hình nhạy cảm.',
  })
  value: unknown;

  @ApiProperty({ example: 'INTEGER' }) valueType: string;

  @ApiProperty({ example: 3, description: 'Revision tăng dần, không ghi đè.' })
  version: number;

  @ApiProperty({ type: String, format: 'date-time' }) effectiveFrom: Date;

  @ApiProperty({ description: 'Cấu hình nhạy cảm không bao giờ trả giá trị.' })
  sensitive: boolean;
}

export class GetAdminConfigsResponseDto {
  @ApiProperty({ type: () => [SystemConfigDto] })
  configs: ISystemConfigSummary[];
}

export class PublishSystemConfigResponseDto {
  @ApiProperty({ type: () => SystemConfigDto })
  config: ISystemConfigSummary;
}

export class AdminAuditLogDto implements IAdminAuditSummary {
  @ApiProperty({ example: 41 }) id: number;

  @ApiProperty({ format: 'uuid', nullable: true }) actorUserId: string | null;

  @ApiProperty({ example: 'PUBLISH' }) action: string;

  @ApiProperty({ example: 'SYSTEM_CONFIG' }) resourceType: string;

  @ApiProperty({ nullable: true }) resourceId: string | null;

  @ApiProperty({ nullable: true }) reason: string | null;

  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}

export class GetAdminAuditLogsResponseDto {
  @ApiProperty({ type: () => [AdminAuditLogDto] })
  logs: IAdminAuditSummary[];
}
