import {
  IGetGroupRolePermissionsUseCase,
  IReplaceGroupRolePermissionsUseCase,
} from '@/application/contracts/admin-config';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Body, Controller, Get, Inject, Param, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  GetGroupRolePermissionsResponseDto,
  GroupRoleParamDto,
  ReplaceGroupRolePermissionsBodyDto,
} from '../../dto/admin-config/admin-group-role.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - Quyền vai trong nhóm')
@ApiBearerAuth()
@Controller('admin/groups/role-permissions')
export class AdminGroupRoleController {
  public constructor(
    @Inject(IGetGroupRolePermissionsUseCase)
    private readonly getUseCase: IGetGroupRolePermissionsUseCase,
    @Inject(IReplaceGroupRolePermissionsUseCase)
    private readonly replaceUseCase: IReplaceGroupRolePermissionsUseCase,
  ) {}

  @Get()
  @RequiresPermission('config.read')
  @ApiOperation({
    summary: 'Bộ quyền của từng vai trong nhóm',
    description:
      'RBAC NHÓM, tách hẳn khỏi RBAC Admin: quyền ở đây luôn mang phạm vi một nhóm cụ thể. Nhét `group.member.remove` vào `admin_permissions` rồi gán cho một trưởng nhóm là cho họ quyền trên MỌI nhóm trong hệ thống. Trả kèm `knownPermissions` và cờ `effective` — một bộ quyền toàn mã mà code chưa kiểm thì gán vai đó không đổi một thứ gì.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException)
  @ApiOkResponse({
    type: ResponseDto.forApi(GetGroupRolePermissionsResponseDto),
  })
  public async getRolePermissions(
    @CurrentUser() principal: IAuthPrincipal,
  ): Promise<ResponseDto<GetGroupRolePermissionsResponseDto>> {
    const result = await this.getUseCase.handle({
      actorUserId: principal.userId,
    });

    return ResponseDto.create<GetGroupRolePermissionsResponseDto>()
      .succeed()
      .attach(result as never)
      .build();
  }

  @Put(':role')
  @RequiresPermission('config.write')
  @ApiOperation({
    summary: 'Thay bộ quyền của một vai',
    description:
      'Thay CẢ TẬP, không thêm từng cái — nên mảng rỗng là thu hồi hết. Mỗi lần sửa ghi thành PHIÊN BẢN mới, dòng cũ ở lại để tra được bộ nào đang chạy lúc một trưởng nhóm bị từ chối, và `admin_audit_logs` giữ cả trước lẫn sau. `OWNER` KHÔNG cấu hình được: thu hồi `group.member.assign_role` của chủ nhóm để lại một nhóm không ai xếp được người vào tổ, mà cũng không lấy lại được vì đường duy nhất để lấy lại là chính endpoint này.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException, [
    ValidationFailedException,
    [
      'role: OWNER không cấu hình được — chủ nhóm phải giữ đủ quyền quản trị nhóm mình',
      'permissions: mã không tồn tại nên sẽ không có tác dụng: group.abc',
    ],
  ])
  @ApiOkResponse({
    type: ResponseDto.forApi(GetGroupRolePermissionsResponseDto),
  })
  public async replaceRolePermissions(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: GroupRoleParamDto,
    @Body() body: ReplaceGroupRolePermissionsBodyDto,
  ): Promise<ResponseDto<GetGroupRolePermissionsResponseDto>> {
    const result = await this.replaceUseCase.handle({
      actorUserId: principal.userId,
      role: params.role,
      rolePermissions: body.rolePermissions,
    });

    return ResponseDto.create<GetGroupRolePermissionsResponseDto>()
      .succeed()
      .attach(result as never)
      .build();
  }
}
