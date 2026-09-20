import {
  IAssignAdminRoleUseCase,
  IListAdminRolesUseCase,
} from '@/application/contracts/admin-config';
import {
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
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AdminRoleUserParamsDto,
  AssignAdminRoleBodyDto,
  ListAdminRolesResponseDto,
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
  ) {}

  @Get('roles')
  @RequiresPermission('admin.manage')
  @ApiOperation({ summary: 'Danh sách role và quyền kèm theo' })
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
