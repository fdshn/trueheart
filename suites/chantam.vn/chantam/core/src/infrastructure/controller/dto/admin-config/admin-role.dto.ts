import {
  IAssignAdminRoleDto,
  ICreateAdminRoleDto,
  IUpdateAdminRoleDto,
} from '@/application/contracts/admin-config';
import {
  IAdminPermissionSummary,
  IAdminRoleSummary,
} from '@/domain/ports/repository';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

const RoleCodePattern = /^[A-Z][A-Z0-9_]{1,79}$/;

export class AdminRoleUserParamsDto {
  @ApiProperty({ format: 'uuid', description: 'Tài khoản được cấp/thu hồi.' })
  @IsUUID()
  userId: string;
}

export class AssignAdminRoleDto implements IAssignAdminRoleDto {
  @ApiProperty({ example: 'POLICY_ADMIN' })
  @IsString()
  @Length(1, 80)
  roleCode: string;

  @ApiProperty({
    example: 'Bổ nhiệm phụ trách chính sách',
    description: 'Bắt buộc, để audit truy được vì sao quyền thay đổi.',
  })
  @IsString()
  @Length(1, 500)
  reason: string;
}

export class AssignAdminRoleBodyDto {
  @ApiProperty({ type: () => AssignAdminRoleDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => AssignAdminRoleDto)
  assignment: AssignAdminRoleDto;
}

export class AdminRoleDto implements IAdminRoleSummary {
  @ApiProperty({ example: 'SUPER_ADMIN' }) code: string;

  @ApiProperty({ example: 'Quản trị toàn hệ thống' }) name: string;

  @ApiProperty() isActive: boolean;

  @ApiProperty({ type: [String], example: ['config.read', 'audit.read'] })
  permissions: string[];
}

export class ListAdminRolesResponseDto {
  @ApiProperty({ type: () => [AdminRoleDto] })
  roles: IAdminRoleSummary[];
}

export class AdminRoleCodeParamsDto {
  @ApiProperty({ example: 'MODERATOR' })
  @IsString()
  @Length(1, 80)
  roleCode: string;
}

export class CreateAdminRoleDto implements ICreateAdminRoleDto {
  @ApiProperty({
    example: 'CONTENT_EDITOR',
    description:
      'Chữ in hoa, số và gạch dưới, bắt đầu bằng chữ cái. Không đổi được sau khi tạo — audit và gán role đều tham chiếu theo mã này.',
  })
  @IsString()
  @Matches(RoleCodePattern, {
    message: 'code chỉ gồm A-Z, 0-9, _ và bắt đầu bằng chữ cái',
  })
  code: string;

  @ApiProperty({ example: 'Biên tập nội dung' })
  @IsString()
  @Length(1, 150)
  name: string;

  @ApiProperty({
    type: [String],
    example: ['blog.write', 'media.read'],
    description: 'Mã permission lấy từ `GET /admin/permissions`. Được để rỗng.',
  })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @Length(1, 120, { each: true })
  permissions: string[];

  @ApiProperty({ example: 'Tách nhóm biên tập khỏi kiểm duyệt' })
  @IsString()
  @Length(1, 500)
  reason: string;
}

export class CreateAdminRoleBodyDto {
  @ApiProperty({ type: () => CreateAdminRoleDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateAdminRoleDto)
  role: CreateAdminRoleDto;
}

export class UpdateAdminRoleDto implements IUpdateAdminRoleDto {
  @ApiPropertyOptional({ example: 'Kiểm duyệt nội dung' })
  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Tắt role thì mọi tài khoản đang giữ nó mất ngay các quyền đi kèm, nhưng việc gán vẫn còn — bật lại là có lại.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    type: [String],
    example: ['report.read', 'report.resolve'],
    description:
      'TRỌN BỘ quyền mới của role (thay thế, không cộng dồn). Bỏ trường này là giữ nguyên quyền; gửi `[]` là gỡ hết.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @Length(1, 120, { each: true })
  permissions?: string[];

  @ApiProperty({ example: 'Moderator không còn xử lý báo cáo' })
  @IsString()
  @Length(1, 500)
  reason: string;
}

export class UpdateAdminRoleBodyDto {
  @ApiProperty({ type: () => UpdateAdminRoleDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => UpdateAdminRoleDto)
  role: UpdateAdminRoleDto;
}

export class AdminPermissionDto implements IAdminPermissionSummary {
  @ApiProperty({ example: 'report.resolve' }) code: string;

  @ApiProperty({ example: 'Xử lý báo cáo vi phạm' }) description: string;
}

export class ListAdminPermissionsResponseDto {
  @ApiProperty({ type: () => [AdminPermissionDto] })
  permissions: IAdminPermissionSummary[];
}
