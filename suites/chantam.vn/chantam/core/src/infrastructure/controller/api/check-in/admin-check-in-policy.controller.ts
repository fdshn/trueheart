import {
  IGetCheckInPolicyUseCase,
  IPublishCheckInPolicyUseCase,
} from '@/application/contracts/check-in';
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
  GetCheckInPolicyResponseDto,
  PublishCheckInPolicyBodyDto,
  PublishCheckInPolicyResponseDto,
} from '../../dto/check-in';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - Điểm danh và chuỗi ngày')
@ApiBearerAuth()
@Controller('admin/check-in-policy')
export class AdminCheckInPolicyController {
  public constructor(
    @Inject(IGetCheckInPolicyUseCase)
    private readonly getPolicyUseCase: IGetCheckInPolicyUseCase,
    @Inject(IPublishCheckInPolicyUseCase)
    private readonly publishPolicyUseCase: IPublishCheckInPolicyUseCase,
  ) {}

  @Get()
  @RequiresPermission('config.read')
  @ApiOperation({
    summary: 'Policy điểm danh đang hiệu lực, kèm lịch sử',
    description:
      'Bản đang chạy là `version` lớn nhất đã tới `effectiveAt`. KHÔNG có cột ' +
      'trạng thái nào phải giữ đồng bộ, nên không có cột nào nói sai được — bài ' +
      'học từ `config_revisions`, nơi đường publish đặt `effective_to` mà giữ ' +
      '`PUBLISHED` suốt N lượt publish và phải có migration đi dọn.\n\n' +
      '`active` là `null` khi chưa Admin nào publish. Khi đó tính năng coi như ' +
      'TẮT và mọi đường ghi trả `CHECK_IN_POLICY_UNAVAILABLE` — không có mặc định ' +
      'nào phát điểm.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetCheckInPolicyResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async getPolicy(@CurrentUser() principal: IAuthPrincipal) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getPolicyUseCase.handle({ actorUserId: principal.userId }),
      )
      .build();
  }

  @Put()
  @RequiresPermission('config.write')
  @ApiOperation({
    summary: 'Publish bản policy điểm danh mới',
    description:
      'Mỗi lần publish là một `version` MỚI; bản cũ không bị viết lại. Nhờ vậy ' +
      '`point_ledger` trỏ được tới đúng bản đã dùng lúc phát điểm, và đổi policy ' +
      'KHÔNG tính lại lịch sử.\n\n' +
      '`expectedVersion` phải khớp bản đang có, nếu không bị từ chối: hai Admin ' +
      'sửa cùng lúc thì người sau sẽ xoá mất thay đổi của người trước mà không ai biết.\n\n' +
      'Bật `enabled` mà thiếu `dailyPoints`, `transactionsPerRepair` hoặc ' +
      '`repairWindowDays` thì bị từ chối kèm danh sách ĐÚNG cái thiếu. Đặc tả nói ' +
      'thẳng là không hard-code một mặc định có tác dụng phát điểm, nên tính năng ' +
      'chỉ chạy sau khi Bên A chốt số và Admin publish.\n\n' +
      'Ngưỡng đổi lượt bù được GHIM theo nhóm đang tích: đổi `transactionsPerRepair` ' +
      'giữa kỳ không quy đổi lại tiến độ người dùng đã có.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(PublishCheckInPolicyResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [
      ValidationFailedException,
      ['expectedVersion: bản hiện tại là 2, không phải 1'],
    ],
  )
  public async publishPolicy(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: PublishCheckInPolicyBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.publishPolicyUseCase.handle({
          actorUserId: principal.userId,
          checkInPolicy: body.checkInPolicy,
        }),
      )
      .build();
  }
}
