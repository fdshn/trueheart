import { IListAdminGroupsUseCase } from '@/application/contracts/admin-config';
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
import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
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
}
