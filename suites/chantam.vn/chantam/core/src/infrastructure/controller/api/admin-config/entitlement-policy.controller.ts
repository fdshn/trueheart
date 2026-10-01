import {
  IGetEntitlementPolicyHistoryUseCase,
  IGetEntitlementPolicyUseCase,
  IPublishEntitlementPolicyUseCase,
} from '@/application/contracts/entitlement';
import {
  EntitlementCapabilityUnknownException,
  EntitlementLimitInvalidException,
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
import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  GetEntitlementPolicyHistoryQueryDto,
  GetEntitlementPolicyHistoryResponseDto,
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
    @Inject(IGetEntitlementPolicyHistoryUseCase)
    private readonly getEntitlementPolicyHistoryUseCase: IGetEntitlementPolicyHistoryUseCase,
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

  // ĐẶT TRƯỚC `@Post()` không cần thiết, nhưng đặt trước các route có tham số thì
  // cần: Nest khớp theo thứ tự khai, và `history` để sau một `:revisionId` tương lai sẽ
  // bị nuốt thành tham số rồi trả 400 vì không phải số.
  @Get('history')
  @RequiresPermission('entitlement.read')
  @ApiOperation({
    summary: 'Lịch sử các bản chính sách quyền/quota',
    description:
      'Các bản đã từng hiệu lực, mới nhất trước, kèm khung thời gian và lý do đổi.\n\n' +
      'Dữ liệu này có đủ từ đầu — `capability_policies.revision_id` trỏ `config_revisions`, và bảng đó giữ `effective_from`/`effective_to` cùng `PUBLISHED`/`ARCHIVED`, đúng cơ chế `system_configs` dùng. Nhưng trước 01/10 không endpoint nào đọc chúng, nên câu **"bài bị từ chối vì quota thì lúc đó quota là bao nhiêu"** chỉ trả lời được bằng SQL tay — đúng vào lúc tệ nhất, khi có người khiếu nại.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(GetEntitlementPolicyHistoryResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async getEntitlementPolicyHistory(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: GetEntitlementPolicyHistoryQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getEntitlementPolicyHistoryUseCase.handle({
          actorUserId: principal.userId,
          limit: query.limit,
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
    [
      EntitlementLimitInvalidException,
      [
        'POST_OPEN',
        'SILVER',
        'đã cho phép thì phải có hạn mức lớn hơn 0 — ô trống bị đọc thành 0 nên sẽ khoá cả bậc này',
      ],
    ],
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
