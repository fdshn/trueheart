import {
  IDissolveAdminGroupUseCase,
  IGetAdminGroupUseCase,
  IListAdminGroupMembersUseCase,
  IListAdminGroupsUseCase,
} from '@/application/contracts/admin-config';
import {
  GroupAlreadyDissolvedException,
  GroupNotFoundException,
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
  Get,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AdminGroupDetailResponseDto,
  AdminGroupIdParamDto,
  DissolveAdminGroupBodyDto,
  ListAdminGroupMembersQueryDto,
  ListAdminGroupMembersResponseDto,
  ListAdminGroupsQueryDto,
  ListAdminGroupsResponseDto,
} from '../../dto/admin-config/admin-group-list.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - Nhóm')
@ApiBearerAuth()
@Controller('admin/groups')
export class AdminGroupListController {
  public constructor(
    @Inject(IListAdminGroupsUseCase)
    private readonly listUseCase: IListAdminGroupsUseCase,
    @Inject(IGetAdminGroupUseCase)
    private readonly getUseCase: IGetAdminGroupUseCase,
    @Inject(IListAdminGroupMembersUseCase)
    private readonly membersUseCase: IListAdminGroupMembersUseCase,
    @Inject(IDissolveAdminGroupUseCase)
    private readonly dissolveUseCase: IDissolveAdminGroupUseCase,
  ) {}

  @Get()
  // Cổng chung vào CMS; use case còn đòi `notification.manage` HOẶC `config.read`
  // — một route chỉ khai được một mã, mà hai màn cần chọn nhóm dùng hai mã khác nhau.
  @RequiresPermission('admin.access')
  @ApiOperation({
    summary: 'Tìm nhóm để chọn',
    description:
      'Cho hai màn đang phải dán UUID: gửi thông báo hàng loạt theo nhóm (`groupId` của broadcast) và lọc sự kiện affiliate theo nhóm. Cần `notification.manage` HOẶC `config.read`.\n\n' +
      '`keyword` khớp tên nhóm, khu vực, username chủ nhóm, hoặc đúng `groupId`. Mới tạo trước.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException, [
    ValidationFailedException,
    ['status must be one of the following values: ACTIVE, DISSOLVED'],
  ])
  @ApiOkResponse({ type: ResponseDto.forApi(ListAdminGroupsResponseDto) })
  public async list(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListAdminGroupsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listUseCase.handle({
          actorUserId: principal.userId,
          keyword: query.keyword,
          status: query.status,
          page: query.page,
          pageSize: query.pageSize,
        }),
      )
      .build();
  }

  @Get(':groupId')
  @RequiresPermission('admin.access')
  @ApiOperation({
    summary: 'Một nhóm cho CMS, mọi trạng thái',
    description:
      'Gồm tâm và bán kính vùng nhóm, mã mời, owner, số thành viên đang hiệu lực, mốc giải tán. Đọc được cả nhóm đã giải tán. Cần `notification.manage` HOẶC `config.read` — cùng quyền với danh sách nhóm.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException, [
    GroupNotFoundException,
  ])
  @ApiOkResponse({ type: ResponseDto.forApi(AdminGroupDetailResponseDto) })
  public async getOne(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: AdminGroupIdParamDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getUseCase.handle({
          actorUserId: principal.userId,
          groupId: params.groupId,
        }),
      )
      .build();
  }

  @Get(':groupId/members')
  @RequiresPermission('admin.access')
  @ApiOperation({
    summary: 'Thành viên đang hiệu lực của một nhóm',
    description:
      'Vai (`OWNER` / `SUBTEAM_ADMIN` / `MEMBER`), tổ, mốc vào nhóm. Nhóm đã giải tán trả rỗng — lịch sử membership vẫn nằm trong database. Cùng quyền với danh sách nhóm.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException, [
    GroupNotFoundException,
  ])
  @ApiOkResponse({ type: ResponseDto.forApi(ListAdminGroupMembersResponseDto) })
  public async members(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: AdminGroupIdParamDto,
    @Query() query: ListAdminGroupMembersQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.membersUseCase.handle({
          actorUserId: principal.userId,
          groupId: params.groupId,
          page: query.page,
          pageSize: query.pageSize,
        }),
      )
      .build();
  }

  @Post(':groupId/dissolve')
  @RequiresPermission('admin.manage')
  @ApiOperation({
    summary: 'Giải tán một nhóm',
    description:
      'Cùng hiệu ứng với Owner xoá tài khoản: nhóm sang `DISSOLVED`, link mời chết ngay, không nhận thành viên hay sự kiện affiliate mới. Membership, sổ điểm và audit GIỮ NGUYÊN; không chuyển Owner cho ai; thành viên cũ được vào hoặc lập nhóm khác. **Không đảo ngược được qua API.**\n\n' +
      '`reason` bắt buộc, ghi audit `DISSOLVE_GROUP`. Nhóm đã giải tán → `409 GROUP_ALREADY_DISSOLVED`. Quyền `admin.manage`.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    [
      ValidationFailedException,
      ['dissolution.reason must be longer than or equal to 3 characters'],
    ],
    [GroupNotFoundException],
    [GroupAlreadyDissolvedException],
  )
  @ApiOkResponse({ type: ResponseDto.forApi(AdminGroupDetailResponseDto) })
  public async dissolve(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: AdminGroupIdParamDto,
    @Body() body: DissolveAdminGroupBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.dissolveUseCase.handle({
          actorUserId: principal.userId,
          groupId: params.groupId,
          reason: body.dissolution.reason,
        }),
      )
      .build();
  }
}
