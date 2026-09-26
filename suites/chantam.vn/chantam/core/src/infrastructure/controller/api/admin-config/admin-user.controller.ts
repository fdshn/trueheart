import {
  IChangeAdminUserStatusUseCase,
  IDeleteAdminUserUseCase,
  IGetAdminUserUseCase,
  IListAdminUsersUseCase,
} from '@/application/contracts/admin-config';
import {
  SelfRoleChangeException,
  UserNotFoundException,
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
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AdminUserMutationResponseDto,
  AdminUserParamsDto,
  AdminUserResponseDto,
  ChangeUserStatusBodyDto,
  DeleteAdminUserBodyDto,
  ListAdminUsersQueryDto,
  ListAdminUsersResponseDto,
} from '../../dto/admin-config/admin-user.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - Người dùng')
@ApiBearerAuth()
@Controller('admin/users')
export class AdminUserController {
  public constructor(
    @Inject(IListAdminUsersUseCase)
    private readonly listAdminUsersUseCase: IListAdminUsersUseCase,
    @Inject(IGetAdminUserUseCase)
    private readonly getAdminUserUseCase: IGetAdminUserUseCase,
    @Inject(IChangeAdminUserStatusUseCase)
    private readonly changeAdminUserStatusUseCase: IChangeAdminUserStatusUseCase,
    @Inject(IDeleteAdminUserUseCase)
    private readonly deleteAdminUserUseCase: IDeleteAdminUserUseCase,
  ) {}

  @Get()
  @RequiresPermission('admin.manage')
  @ApiOperation({
    summary: 'Tìm người dùng',
    description:
      'Lọc theo username/email/SĐT (khớp một phần), hạng, trạng thái, role quản trị, đã xác minh SĐT và khoảng thời gian đăng ký. ' +
      'Mặc định ẩn tài khoản đã xoá.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListAdminUsersResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async listUsers(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListAdminUsersQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listAdminUsersUseCase.handle({
          actorUserId: principal.userId,
          username: query.username,
          email: query.email,
          phone: query.phone,
          rank: query.rank,
          status: query.status,
          adminRole: query.adminRole,
          phoneVerified: query.phoneVerified,
          emailVerified: query.emailVerified,
          accuracyReviewRequired: query.accuracyReviewRequired,
          registeredFrom: query.registeredFrom,
          registeredTo: query.registeredTo,
          includeDeleted: query.includeDeleted,
          page: query.page,
          pageSize: query.pageSize,
        }),
      )
      .build();
  }

  @Get(':userId')
  @RequiresPermission('admin.manage')
  @ApiOperation({
    summary: 'Chi tiết một người dùng',
    description:
      'KHÔNG bao giờ trả `password_hash` — trường này bị loại ngay ở danh sách cột được chọn, không phải lọc lại sau khi đã đọc lên. Người đã xoá mềm vẫn tra được để phục vụ đối chiếu lịch sử, nhưng dữ liệu cá nhân đã bị ẩn danh.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(AdminUserResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [UserNotFoundException],
  )
  public async getUser(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: AdminUserParamsDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getAdminUserUseCase.handle({
          actorUserId: principal.userId,
          targetUserId: params.userId,
        }),
      )
      .build();
  }

  @Patch(':userId/status')
  @RequiresPermission('admin.manage')
  @ApiOperation({
    summary: 'Đổi trạng thái tài khoản',
    description:
      'Khoá hoặc cấm sẽ thu hồi cả access token lẫn phiên đăng nhập ngay lập tức. ' +
      'Hạng và điểm KHÔNG sửa được qua đây: hạng đi qua rank writer, điểm đi qua ledger.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(AdminUserMutationResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [SelfRoleChangeException],
    [
      ValidationFailedException,
      ['suspendedUntil là bắt buộc khi tạm khoá tài khoản'],
    ],
  )
  public async changeStatus(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: AdminUserParamsDto,
    @Body() body: ChangeUserStatusBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.changeAdminUserStatusUseCase.handle({
          actorUserId: principal.userId,
          targetUserId: params.userId,
          statusChange: body.statusChange,
        }),
      )
      .build();
  }

  @Delete(':userId')
  @RequiresPermission('admin.manage')
  @ApiOperation({
    summary: 'Xoá mềm tài khoản',
    description:
      'Ẩn danh email/SĐT/họ tên nhưng giữ username để người khác không đăng ký lại tên đó rồi mạo danh. Thu hồi toàn bộ token và phiên.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(AdminUserMutationResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [SelfRoleChangeException],
    [ValidationFailedException, ['reason không được để trống']],
  )
  public async deleteUser(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: AdminUserParamsDto,
    @Body() body: DeleteAdminUserBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.deleteAdminUserUseCase.handle({
          actorUserId: principal.userId,
          targetUserId: params.userId,
          deletion: body.deletion,
        }),
      )
      .build();
  }
}
