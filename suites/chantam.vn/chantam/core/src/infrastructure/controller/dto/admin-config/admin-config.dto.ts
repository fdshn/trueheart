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
