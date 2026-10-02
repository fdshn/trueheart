import {
  IGetAffiliateEventRewardsUseCase,
  IGetAffiliatePolicyUseCase,
  IListAffiliateEventsUseCase,
  IPublishAffiliatePolicyUseCase,
  IReverseAffiliateEventUseCase,
} from '@/application/contracts/affiliate';
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
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  GetAffiliateEventRewardsResponseDto,
  GetAffiliatePolicyResponseDto,
  ListAffiliateEventsQueryDto,
  ListAffiliateEventsResponseDto,
  PublishAffiliatePolicyBodyDto,
  PublishAffiliatePolicyResponseDto,
  ReverseAffiliateEventBodyDto,
  ReverseAffiliateEventResponseDto,
} from '../../dto/affiliate';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - Affiliate nhóm')
@ApiBearerAuth()
@Controller('admin')
export class AdminAffiliateController {
  public constructor(
    @Inject(IGetAffiliatePolicyUseCase)
    private readonly getPolicyUseCase: IGetAffiliatePolicyUseCase,
    @Inject(IPublishAffiliatePolicyUseCase)
    private readonly publishPolicyUseCase: IPublishAffiliatePolicyUseCase,
    @Inject(IListAffiliateEventsUseCase)
    private readonly listEventsUseCase: IListAffiliateEventsUseCase,
    @Inject(IGetAffiliateEventRewardsUseCase)
    private readonly getRewardsUseCase: IGetAffiliateEventRewardsUseCase,
    @Inject(IReverseAffiliateEventUseCase)
    private readonly reverseUseCase: IReverseAffiliateEventUseCase,
  ) {}

  @Get('affiliate-policy')
  @RequiresPermission('config.read')
  @ApiOperation({
    summary: 'Chính sách affiliate đang hiệu lực, kèm lịch sử',
    description:
      'Bản đang chạy là `version` lớn nhất đã tới `effectiveAt` — không có cột trạng ' +
      'thái nào phải giữ đồng bộ.\n\n' +
      '`active` là `null` khi chưa Admin nào publish. Khi đó bộ máy KHÔNG ghi gì: mọi ' +
      'lượt đăng bài và hoàn tất lượt trao vẫn chạy bình thường, chỉ không sinh ' +
      'affiliate event nào.\n\n' +
      'SRS gọi đường cấu hình này là `PATCH /admin/affiliate-rules/{id}`. Ở đây dùng ' +
      'lối publish-cả-bản-có-version như `/admin/entitlements` và ' +
      '`/admin/check-in-policy`: sửa từng rule rời thì không trả lời được câu "lúc ' +
      'người này được cộng điểm thì chính sách là gì".',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetAffiliatePolicyResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async getPolicy(@CurrentUser() principal: IAuthPrincipal) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getPolicyUseCase.handle({ actorUserId: principal.userId }),
      )
      .build();
  }

  @Put('affiliate-policy')
  @RequiresPermission('config.write')
  @ApiOperation({
    summary: 'Publish chính sách affiliate mới',
    description:
      '**Năm câu của Bên A nằm hết trong body này** — A1 `distributionMode`, A2/A3 ' +
      '`eventPoints`, A4 `dailyCapPerBeneficiary`. Nhờ vậy chúng là lựa chọn trong một ' +
      'form, không phải một lượt viết lại bộ máy.\n\n' +
      'Bật `enabled` mà thiếu trần ngày, trần người nhận, hoặc mọi loại sự kiện đều 0 ' +
      'điểm thì bị TỪ CHỐI kèm danh sách đúng cái thiếu. ROADMAP ghi rõ *"thả M5 ra mà ' +
      'chưa có chống gian lận là mở cửa cho farm điểm"*, nên một chính sách bật mà ' +
      'không trần là đúng cái cửa đó.\n\n' +
      '`expectedVersion` phải khớp bản đang có, nếu không bị từ chối.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(PublishAffiliatePolicyResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [
      ValidationFailedException,
      ['dailyCapPerBeneficiary phải lớn hơn 0 khi bật'],
    ],
  )
  public async publishPolicy(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: PublishAffiliatePolicyBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.publishPolicyUseCase.handle({
          actorUserId: principal.userId,
          expectedVersion: body.affiliatePolicy.expectedVersion,
          policy: body.affiliatePolicy,
          effectiveAt: body.affiliatePolicy.effectiveAt,
          reason: body.affiliatePolicy.reason,
        }),
      )
      .build();
  }

  @Get('affiliate-events')
  @RequiresPermission('config.read')
  @ApiOperation({
    summary: 'Audit sự kiện affiliate',
    description:
      'Mọi sự kiện đều ở đây, **kể cả sự kiện bị loại vì ngoài vùng** — BR-GEO-AFF-03 ' +
      'đòi lưu để audit với `point_delta = 0`, không im lặng bỏ.\n\n' +
      'Dùng `?geoStatus=NOT_ELIGIBLE_GEO` để trả lời câu Owner hay mang tới nhất: "vì ' +
      'sao nhóm tôi không được điểm". `locationSource` nói toạ độ nào đã dùng, và ' +
      '`distanceMeters`/`radiusMeters` nói lệch bao nhiêu.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListAffiliateEventsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async listEvents(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListAffiliateEventsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listEventsUseCase.handle({
          actorUserId: principal.userId,
          groupId: query.groupId,
          geoStatus: query.geoStatus,
          page: query.page,
          pageSize: query.pageSize,
        }),
      )
      .build();
  }

  @Get('affiliate-events/:eventId/rewards')
  @RequiresPermission('config.read')
  @ApiOperation({
    summary: 'Các dòng reward của một sự kiện',
    description:
      'Một sự kiện sinh nhiều dòng (BR-AFF-03), mỗi dòng một Active Member. Trạng thái ' +
      '`CAPPED` nghĩa là người đó đã đầy trần ngày — vẫn lưu dòng để Owner thấy họ CÓ ' +
      'trong danh sách chia, không phải bị bỏ sót.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(GetAffiliateEventRewardsResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async listRewards(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('eventId') eventId: string,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getRewardsUseCase.handle({
          actorUserId: principal.userId,
          eventId,
        }),
      )
      .build();
  }

  @Post('affiliate-events/:eventId/reversal')
  @RequiresPermission('point.adjust')
  @ApiOperation({
    summary: 'Thu hồi toàn bộ reward của một sự kiện',
    description:
      'Câu A5. **Ghi thêm bút toán đảo, không xoá lịch sử** — BR-AFF-04 nguyên văn ' +
      '*"tạo adjustment ledger tương ứng thay vì xóa lịch sử"*.\n\n' +
      'Dòng reward đổi sang `REVERSED` và GIỮ `pointDelta` cùng `pointLedgerId`, nên từ ' +
      'đây tra được cả bút toán gốc lẫn bút toán đảo trong `point_ledger`.\n\n' +
      'Quyền `point.adjust`, không `config.write`: đây là can thiệp vào số điểm của ' +
      'những người cụ thể, cùng loại với `POST /admin/points/adjust`.\n\n' +
      'Gọi lại lần hai trả `reversedCount: 0` thay vì lỗi — thu hồi hai lần là vô hại, ' +
      'còn ném làm Admin tưởng lần đầu thất bại.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ReverseAffiliateEventResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [ValidationFailedException, ['reason: phải nêu lý do thu hồi']],
  )
  public async reverse(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('eventId') eventId: string,
    @Body() body: ReverseAffiliateEventBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.reverseUseCase.handle({
          actorUserId: principal.userId,
          eventId,
          reason: body.reversal.reason,
        }),
      )
      .build();
  }
}
