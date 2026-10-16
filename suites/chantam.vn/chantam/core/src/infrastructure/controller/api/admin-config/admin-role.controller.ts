import {
  IAssignAdminRoleUseCase,
  ICreateAdminRoleUseCase,
  IGetOwnAdminAccessUseCase,
  IListAdminPermissionsUseCase,
  IListAdminRolesUseCase,
  IUpdateAdminRoleUseCase,
} from '@/application/contracts/admin-config';
import {
  AdminPermissionUnknownException,
  AdminRoleCodeConflictException,
  AdminRoleNotFoundException,
  AdminRoleProtectedException,
  AdminRoleSelfLockoutException,
  LastSuperAdminException,
  SelfRoleChangeException,
} from '@/domain/exceptions';
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
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminAccessResponseDto } from '../../dto/admin-config/admin-access.dto';
import {
  AdminRoleCodeParamsDto,
  AdminRoleUserParamsDto,
  AssignAdminRoleBodyDto,
  CreateAdminRoleBodyDto,
  ListAdminPermissionsResponseDto,
  ListAdminRolesResponseDto,
  UpdateAdminRoleBodyDto,
} from '../../dto/admin-config/admin-role.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - Phân quyền')
@ApiBearerAuth()
@Controller('admin')
export class AdminRoleController {
  public constructor(
    @Inject(IListAdminRolesUseCase)
    private readonly listAdminRolesUseCase: IListAdminRolesUseCase,
    @Inject(IAssignAdminRoleUseCase)
    private readonly assignAdminRoleUseCase: IAssignAdminRoleUseCase,
    @Inject(IGetOwnAdminAccessUseCase)
    private readonly getOwnAdminAccessUseCase: IGetOwnAdminAccessUseCase,
    @Inject(IListAdminPermissionsUseCase)
    private readonly listAdminPermissionsUseCase: IListAdminPermissionsUseCase,
    @Inject(ICreateAdminRoleUseCase)
    private readonly createAdminRoleUseCase: ICreateAdminRoleUseCase,
    @Inject(IUpdateAdminRoleUseCase)
    private readonly updateAdminRoleUseCase: IUpdateAdminRoleUseCase,
  ) {}

  @Get('me')
  @RequiresPermission('admin.access')
  @ApiOperation({
    summary: 'Role và permission của phiên Admin hiện tại',
    description:
      'Đọc lại từ database ở mỗi request; CMS không phân quyền theo snapshot trong JWT.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(AdminAccessResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async getOwnAccess(@CurrentUser() principal: IAuthPrincipal) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getOwnAdminAccessUseCase.handle({
          actorUserId: principal.userId,
          username: principal.username,
        }),
      )
      .build();
  }

  @Get('roles')
  @RequiresPermission('admin.manage')
  @ApiOperation({
    summary: 'Danh sách role và quyền kèm theo',
    description:
      'Trả ma trận role × permission để giao diện dựng bảng phân quyền mà không phải hardcode mã quyền. Chỉ liệt kê role đang bật.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListAdminRolesResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async listRoles(@CurrentUser() principal: IAuthPrincipal) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listAdminRolesUseCase.handle({
          actorUserId: principal.userId,
        }),
      )
      .build();
  }

  @Get('permissions')
  @RequiresPermission('admin.manage')
  @ApiOperation({
    summary: 'Danh mục permission',
    description:
      'Mọi permission hệ thống có, kèm mô tả — làm cột cho ma trận phân quyền. Permission do migration khai báo; CMS không tạo được permission mới vì phải có code kiểm tra nó.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListAdminPermissionsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async listPermissions(@CurrentUser() principal: IAuthPrincipal) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listAdminPermissionsUseCase.handle({
          actorUserId: principal.userId,
        }),
      )
      .build();
  }

  @Post('roles')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('admin.manage')
  @ApiOperation({
    summary: 'Tạo role mới',
    description:
      'Tạo role đang bật kèm bộ quyền ban đầu. Trả lại toàn bộ ma trận role để CMS vẽ lại. Ghi audit `CREATE_ROLE` (resourceType `ADMIN_ROLE_DEFINITION`, resourceId = mã role).',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListAdminRolesResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [AdminRoleCodeConflictException, 'MODERATOR'],
    [AdminPermissionUnknownException, ['post.fly']],
    [ValidationFailedException, ['reason không được để trống']],
  )
  public async createRole(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: CreateAdminRoleBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.createAdminRoleUseCase.handle({
          actorUserId: principal.userId,
          role: body.role,
        }),
      )
      .build();
  }

  @Patch('roles/:roleCode')
  @RequiresPermission('admin.manage')
  @ApiOperation({
    summary: 'Sửa role: tên, bật/tắt, bộ quyền',
    description:
      'Chỉ đổi những trường được gửi; `permissions` là trọn bộ quyền mới. SUPER_ADMIN không sửa được. Từ chối nếu sau thay đổi chính người sửa mất `admin.manage`. Ghi audit `UPDATE_ROLE` kèm before/after; gửi lại đúng trạng thái cũ thì không ghi.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListAdminRolesResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [AdminRoleNotFoundException, 'CONTENT_EDITOR'],
    [AdminRoleProtectedException, 'SUPER_ADMIN'],
    [AdminPermissionUnknownException, ['post.fly']],
    [AdminRoleSelfLockoutException],
    [ValidationFailedException, ['reason không được để trống']],
  )
  public async updateRole(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: AdminRoleCodeParamsDto,
    @Body() body: UpdateAdminRoleBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.updateAdminRoleUseCase.handle({
          actorUserId: principal.userId,
          roleCode: params.roleCode,
          role: body.role,
        }),
      )
      .build();
  }

  @Post('users/:userId/roles')
  @RequiresPermission('admin.manage')
  @ApiOperation({
    summary: 'Cấp role cho một tài khoản',
    description: 'Không tự cấp cho chính mình; mọi thay đổi đều ghi audit.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListAdminRolesResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [SelfRoleChangeException],
    [ValidationFailedException, ['reason không được để trống']],
  )
  public async grantRole(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: AdminRoleUserParamsDto,
    @Body() body: AssignAdminRoleBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.assignAdminRoleUseCase.handle({
          actorUserId: principal.userId,
          targetUserId: params.userId,
          assignment: body.assignment,
          grant: true,
        }),
      )
      .build();
  }

  @Delete('users/:userId/roles')
  @RequiresPermission('admin.manage')
  @ApiOperation({
    summary: 'Thu hồi role của một tài khoản',
    description:
      'Không thu hồi được SUPER_ADMIN cuối cùng: mất người cuối cùng là không còn ai cấp lại quyền.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListAdminRolesResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [SelfRoleChangeException],
    [LastSuperAdminException],
    [ValidationFailedException, ['reason không được để trống']],
  )
  public async revokeRole(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: AdminRoleUserParamsDto,
    @Body() body: AssignAdminRoleBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.assignAdminRoleUseCase.handle({
          actorUserId: principal.userId,
          targetUserId: params.userId,
          assignment: body.assignment,
          grant: false,
        }),
      )
      .build();
  }
}
