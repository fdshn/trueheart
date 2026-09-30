import { GroupMemberRoles } from '@chantam.vn/chantam.core-lib/consts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsEnum,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

export class GroupRolePermissionSetDto {
  @ApiProperty({ enum: GroupMemberRoles })
  role: GroupMemberRoles;

  @ApiProperty({ description: 'Số phiên bản của BỘ quyền, tăng mỗi lần sửa.' })
  version: number;

  @ApiProperty({ type: [String] })
  permissions: string[];

  @ApiPropertyOptional({
    description:
      'true khi bộ này có ít nhất một quyền mà CODE thật sự kiểm. false nghĩa là gán vai này hiện không đổi một thứ gì.',
  })
  effective?: boolean;
}

export class GetGroupRolePermissionsResponseDto {
  @ApiProperty({ type: [GroupRolePermissionSetDto] })
  roles: GroupRolePermissionSetDto[];

  @ApiProperty({
    type: [String],
    description:
      'Mọi mã quyền nhóm hợp lệ. Gửi mã ngoài danh sách này bị từ chối — một mã gõ nhầm lưu thành công là một quyền không bao giờ có tác dụng mà không hiện ra ở đâu.',
  })
  knownPermissions: string[];
}

export class ReplaceGroupRolePermissionsDto {
  @ApiProperty({
    type: [String],
    example: ['group.subteam.member.view', 'group.subteam.activity.view'],
    description:
      'Thay CẢ TẬP, không phải thêm từng cái. Mảng rỗng là thu hồi hết quyền của vai đó.',
  })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  permissions: string[];

  @ApiProperty({
    example: 'Bên A chốt trưởng tổ xem được hoạt động tổ mình, ngày 30/09',
    description: 'Bắt buộc — đây là thứ người đọc audit log sẽ thấy.',
  })
  @IsString()
  @Length(10, 500)
  reason: string;
}

export class ReplaceGroupRolePermissionsBodyDto {
  @ApiProperty({ type: () => ReplaceGroupRolePermissionsDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ReplaceGroupRolePermissionsDto)
  rolePermissions: ReplaceGroupRolePermissionsDto;
}

export class GroupRoleParamDto {
  @ApiProperty({ enum: GroupMemberRoles })
  @IsEnum(GroupMemberRoles)
  role: GroupMemberRoles;
}
