import {
  IGetGroupRadiusPolicyUseCase,
  IPublishGroupRadiusPolicyUseCase,
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
import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  GetGroupRadiusPolicyResponseDto,
  PublishGroupRadiusPolicyBodyDto,
} from '../../dto/admin-config/admin-group-radius.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - Bán kính vùng nhóm')
@ApiBearerAuth()
@Controller('admin/groups/radius-policy')
export class AdminGroupRadiusController {
  public constructor(
    @Inject(IGetGroupRadiusPolicyUseCase)
    private readonly getUseCase: IGetGroupRadiusPolicyUseCase,
    @Inject(IPublishGroupRadiusPolicyUseCase)
    private readonly publishUseCase: IPublishGroupRadiusPolicyUseCase,
  ) {}

  @Get()
  @RequiresPermission('config.read')
  @ApiOperation({
    summary: 'Thang bán kính vùng nhóm theo bậc',
    description:
      'Cả thang một lượt, thay vì bốn khoá rời rạc lẫn giữa mười mấy khoá khác. `inherited` cho biết bậc nào chưa có số riêng và đang dùng `defaultMeters`; `canCreateGroup` cho biết bậc nào THẬT SỰ tạo được nhóm — hôm nay chỉ Kim Cương, nên ba bậc dưới là số chờ sẵn chứ không phải vùng đang hoạt động.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException)
  @ApiOkResponse({
    type: ResponseDto.forApi(GetGroupRadiusPolicyResponseDto),
  })
  public async getRadiusPolicy(
    @CurrentUser() principal: IAuthPrincipal,
  ): Promise<ResponseDto<GetGroupRadiusPolicyResponseDto>> {
    const result = await this.getUseCase.handle({
      actorUserId: principal.userId,
    });

    return ResponseDto.create<GetGroupRadiusPolicyResponseDto>()
      .succeed()
      .attach(result as never)
      .build();
  }

  @Put()
  @RequiresPermission('config.write')
  @ApiOperation({
    summary: 'Đặt thang bán kính',
    description:
      'Ghi trên CÙNG bốn khoá `group.radius_meters.<bậc>` mà `POST /admin/system-configs` sửa được, nên hai đường ra cùng một chỗ. Khác biệt: endpoint này canh được **đơn điệu tăng theo bậc** — bất biến của cả thang mà một lượt ghi từng khoá không có gì để so, và bậc cao mà vùng hẹp hơn bậc thấp thì thăng bậc thành hình phạt. Phép kiểm chạy trên thang SAU KHI trộn với giá trị đang có, nên sửa một bậc vẫn thấy quan hệ với ba bậc kia. Bán kính là snapshot lúc tạo nhóm (BR-GRP-03), nên một thang sai để lại nhóm sai vĩnh viễn.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException, [
    ValidationFailedException,
    [
      'ladder: bán kính phải KHÔNG GIẢM theo bậc — GOLD (3000 m) hẹp hơn SILVER (5000 m), tức thăng bậc thành hình phạt',
      'bán kính phải là số nguyên trong khoảng 1000–50000 m; 60000 nằm ngoài cận cứng của cột groups.radius_km',
    ],
  ])
  @ApiOkResponse({
    type: ResponseDto.forApi(GetGroupRadiusPolicyResponseDto),
  })
  public async publishRadiusPolicy(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: PublishGroupRadiusPolicyBodyDto,
  ): Promise<ResponseDto<GetGroupRadiusPolicyResponseDto>> {
    const result = await this.publishUseCase.handle({
      actorUserId: principal.userId,
      radiusPolicy: body.radiusPolicy,
    });

    return ResponseDto.create<GetGroupRadiusPolicyResponseDto>()
      .succeed()
      .attach(result as never)
      .build();
  }
}
