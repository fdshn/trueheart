import {
  IGetEntitlementPolicyUseCase,
  IPublishEntitlementPolicyUseCase,
} from '@/application/contracts/entitlement';
import {
  EntitlementCapabilityUnknownException,
  EntitlementPolicyUnavailableException,
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
import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  GetEntitlementPolicyResponseDto,
  PublishEntitlementPolicyBodyDto,
  PublishEntitlementPolicyResponseDto,
} from '../../dto/admin-config/entitlement-policy.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - Quyền và quota theo rank')
@ApiBearerAuth()
@Controller('admin/entitlements')
export class EntitlementPolicyController {
  public constructor(
    @Inject(IGetEntitlementPolicyUseCase)
    private readonly getEntitlementPolicyUseCase: IGetEntitlementPolicyUseCase,
    @Inject(IPublishEntitlementPolicyUseCase)
    private readonly publishEntitlementPolicyUseCase: IPublishEntitlementPolicyUseCase,
  ) {}

  @Get()
  @RequiresPermission('entitlement.read')
  @ApiOperation({
    summary: 'Bản chính sách quyền/quota đang hiệu lực',
    description:
      'Trả toàn bộ bảng capability × rank của bản đang áp dụng, kèm lý do thay đổi lần gần nhất.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(GetEntitlementPolicyResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    EntitlementPolicyUnavailableException,
  )
  public async getEntitlementPolicy(@CurrentUser() principal: IAuthPrincipal) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getEntitlementPolicyUseCase.handle({
          actorUserId: principal.userId,
        }),
      )
      .build();
  }

  @Post()
  @RequiresPermission('entitlement.write')
  @ApiOperation({
    summary: 'Publish bản chính sách mới',
    description:
      'Chỉ gửi những ô cần đổi; phần không nhắc tới được giữ nguyên. Bản cũ được đóng lại và bản mới có hiệu lực ngay, không cần deploy. Mọi lần publish đều ghi audit kèm giá trị trước/sau.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(PublishEntitlementPolicyResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [
      ValidationFailedException,
      ['changeReason must be longer than or equal to 1 characters'],
    ],
    [EntitlementCapabilityUnknownException, 'POST_TELEPATHY'],
    EntitlementPolicyUnavailableException,
  )
  public async publishEntitlementPolicy(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: PublishEntitlementPolicyBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.publishEntitlementPolicyUseCase.handle({
          actorUserId: principal.userId,
          changeReason: body.changeReason,
          capabilities: body.capabilities,
        }),
      )
      .build();
  }
}
