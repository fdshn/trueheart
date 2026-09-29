import { IGetAdminDashboardUseCase } from '@/application/contracts/admin-config';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AdminDashboardQueryDto,
  AdminDashboardResponseDto,
} from '../../dto/admin-config/admin-dashboard.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Quản trị — số liệu')
@ApiBearerAuth()
@Controller('admin/dashboard')
export class AdminDashboardController {
  public constructor(
    @Inject(IGetAdminDashboardUseCase)
    private readonly getAdminDashboardUseCase: IGetAdminDashboardUseCase,
  ) {}

  @Get()
  @RequiresPermission('dashboard.read')
  @ApiOperation({
    summary: 'Bảng số liệu điều hành (F59)',
    description:
      'Năm khối số liệu: người dùng và phân bổ hạng, bài theo danh mục, giao dịch, dung lượng media, và hàng đợi đang tồn. ' +
      'Đếm SỐNG, không có bảng tổng hợp — một bảng tổng hợp đòi job cập nhật, một đường đối soát khi job chết, và một câu trả lời cho "vì sao số trên dashboard khác số khi đếm tay". Với quy mô hiện tại cái giá đó lớn hơn cái lợi. ' +
      'Quyền RIÊNG `dashboard.read`, không ghép vào `config.read`: xem số liệu và sửa chính sách là hai việc khác nhau. Gán cho `SUPER_ADMIN` và `AUDITOR`, KHÔNG cho `MODERATOR` — họ xử nội dung từng cái, số liệu tăng trưởng không giúp gì cho việc đó.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(AdminDashboardResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async getDashboard(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: AdminDashboardQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getAdminDashboardUseCase.handle({
          actorUserId: principal.userId,
          windowDays: query.windowDays,
        }),
      )
      .build();
  }
}
