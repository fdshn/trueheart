import { IAssignAdminRoleDto } from '@/application/contracts/admin-config';
import { IAdminRoleSummary } from '@/domain/ports/repository';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';

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
