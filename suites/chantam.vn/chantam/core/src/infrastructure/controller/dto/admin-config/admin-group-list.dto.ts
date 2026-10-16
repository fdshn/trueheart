import { GroupStatuses } from '@chantam.vn/chantam.core-lib/consts';
import {
  MaxPageSize,
  PaginationMetaDto,
} from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListAdminGroupsQueryDto {
  @ApiPropertyOptional({
    maxLength: 150,
    example: 'cau giay',
    description:
      'Khớp tên nhóm, khu vực, username chủ nhóm (không phân biệt hoa thường), hoặc dán ĐÚNG `groupId`. Bỏ trống thì không lọc.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  keyword?: string;

  @ApiPropertyOptional({
    enum: GroupStatuses,
    description:
      'Bỏ trống thì gồm cả nhóm đã giải tán. Màn gửi thông báo nên gửi `ACTIVE`.',
  })
  @IsOptional()
  @IsEnum(GroupStatuses)
  status?: GroupStatuses;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: MaxPageSize, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MaxPageSize)
  pageSize?: number;
}

export class AdminGroupListItemDto {
  @ApiProperty({ format: 'uuid' }) groupId: string;
  @ApiProperty() name: string;
  @ApiProperty() regionLabel: string;
  @ApiProperty({ enum: GroupStatuses }) status: GroupStatuses;
  @ApiProperty({ format: 'uuid' }) ownerId: string;
  @ApiProperty() ownerUsername: string;

  @ApiProperty({ description: 'Chỉ người ĐANG trong nhóm.' })
  memberCount: number;

  @ApiProperty() createdAt: Date;
}

export class ListAdminGroupsResponseDto {
  @ApiProperty({
    type: () => [AdminGroupListItemDto],
    description: 'Mới tạo trước.',
  })
  groups: AdminGroupListItemDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}
