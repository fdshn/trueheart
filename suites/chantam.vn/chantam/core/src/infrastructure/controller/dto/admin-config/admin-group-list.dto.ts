import { GroupStatuses } from '@chantam.vn/chantam.core-lib/consts';
import {
  MaxPageSize,
  PaginationMetaDto,
} from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { GroupMemberItemDto } from '../group/group.dto';

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

export class AdminGroupIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  groupId: string;
}

export class AdminGroupDetailDto extends AdminGroupListItemDto {
  @ApiProperty({ type: String, nullable: true }) description: string | null;
  @ApiProperty({ type: String, nullable: true }) avatarUrl: string | null;
  @ApiProperty({ type: String, nullable: true }) coverUrl: string | null;

  @ApiProperty({
    description:
      'Tâm nhóm — chụp từ Vị trí mặc định của Owner lúc tạo, không đổi.',
  })
  centerLat: number;

  @ApiProperty() centerLng: number;

  @ApiProperty({ description: 'Bán kính vùng nhóm, chụp theo hạng lúc tạo.' })
  radiusKm: number;

  @ApiProperty({
    description: 'Mã mời. Hết dùng được khi nhóm không còn ACTIVE.',
  })
  inviteCode: string;

  @ApiProperty({
    example: '/invite/ABCD2345EFGH6789',
    description:
      'Đường dẫn tương đối của trang mời — web và app cùng mở đường này. Luôn có.',
  })
  invitePath: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://chantam.vn/invite/ABCD2345EFGH6789',
    description:
      '`WEB_PUBLIC_BASE_URL` + `invitePath`. `null` khi môi trường chưa cấu hình web công khai — client hiện `inviteCode` thay thế.',
  })
  inviteUrl: string | null;

  @ApiProperty({ type: String, format: 'date-time' }) activatedAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dissolvedAt: Date | null;
}

export class AdminGroupDetailResponseDto {
  @ApiProperty({ type: () => AdminGroupDetailDto })
  group: AdminGroupDetailDto;
}

export class ListAdminGroupMembersQueryDto {
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

export class ListAdminGroupMembersResponseDto {
  @ApiProperty({
    type: () => [GroupMemberItemDto],
    description:
      'Chỉ thành viên ĐANG hiệu lực, vào trước đứng trước. Nhóm đã giải tán trả rỗng.',
  })
  members: GroupMemberItemDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class DissolveAdminGroupDto {
  @ApiProperty({
    minLength: 3,
    maxLength: 500,
    example: 'Gian lận affiliate: tài khoản ảo hàng loạt',
    description: 'Bắt buộc — đi vào audit log.',
  })
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class DissolveAdminGroupBodyDto {
  @ApiProperty({ type: () => DissolveAdminGroupDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => DissolveAdminGroupDto)
  dissolution: DissolveAdminGroupDto;
}

export class RotateAdminGroupInviteBodyDto {
  @ApiProperty({
    type: () => DissolveAdminGroupDto,
    description: 'Cùng dạng `{ reason }`.',
  })
  @IsDefined()
  @ValidateNested()
  @Type(() => DissolveAdminGroupDto)
  rotation: DissolveAdminGroupDto;
}
