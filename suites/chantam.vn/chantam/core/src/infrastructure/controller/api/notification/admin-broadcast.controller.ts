import {
  ICreateBroadcastUseCase,
  IListBroadcastsUseCase,
  ISendBroadcastNowUseCase,
} from '@/application/contracts/notification';
import {
  NotificationBroadcastAlreadyCompletedException,
  NotificationBroadcastInProgressException,
  NotificationBroadcastNotFoundException,
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
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  BroadcastIdParamDto,
  CreateBroadcastBodyDto,
  CreateBroadcastResponseDto,
  ListBroadcastsQueryDto,
  ListBroadcastsResponseDto,
  SendBroadcastNowResponseDto,
} from '../../dto/notification/broadcast.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - Gửi thông báo hàng loạt')
@ApiBearerAuth()
@Controller('admin/notifications')
export class AdminBroadcastController {
  public constructor(
    @Inject(ICreateBroadcastUseCase)
    private readonly createUseCase: ICreateBroadcastUseCase,
    @Inject(IListBroadcastsUseCase)
    private readonly listUseCase: IListBroadcastsUseCase,
    @Inject(ISendBroadcastNowUseCase)
    private readonly sendNowUseCase: ISendBroadcastNowUseCase,
  ) {}

  @Post('broadcasts')
  @RequiresPermission('notification.manage')
  @ApiOperation({
    summary: 'Xếp một lượt gửi thông báo hàng loạt',
    description:
      'Endpoint này **KHÔNG gửi gì** — nó ghi một lượt gửi ở trạng thái `PENDING` rồi ' +
      'trả ngay, kèm số người nhận đã đếm trước. Gửi thật đi qua `npm run notify:broadcast` ' +
      '(cron), hoặc `POST /admin/notifications/broadcasts/:broadcastId/send` (nút "Gửi ngay").\n\n' +
      'Gửi đồng bộ trong một request HTTP là hết giờ ở lượt đầu tiên có trăm nghìn ' +
      'người nhận.\n\n' +
      '**Ba chế độ người nhận** đúng những gì SRS mục 1507 nêu — *"toàn hệ thống hoặc ' +
      'theo nhóm/vùng"*:\n' +
      '- `ALL` — toàn bộ người dùng đang hoạt động\n' +
      '- `GROUP` — thành viên một nhóm (dùng `EXISTS`, nên người thuộc nhiều sub-team ' +
      'chỉ được đếm một lần)\n' +
      '- `AREA` — người có **Vị trí mặc định** trong bán kính, đo bằng `ST_DWithin` trên ' +
      '`geography`. Người chưa đặt Vị trí mặc định KHÔNG nhận được: không biết họ ở đâu ' +
      'thì không thể nói họ ở trong vùng.\n\n' +
      '`audience.type` lạ bị TỪ CHỐI, **không** lùi về `ALL` — một bộ lọc đọc không ra ' +
      'mà thành "gửi cho tất cả" là gửi cho trăm nghìn người thay vì một nhóm nhỏ.\n\n' +
      'Loại thông báo là `SYSTEM_BROADCAST`, thuộc nhóm `SYSTEM`, nên người dùng **tắt ' +
      'được** qua `PATCH /notifications/me/preferences`. Đó là chủ ý: SRS nói họ quản ' +
      'được các nhóm thông báo không bắt buộc.\n\n' +
      'Một lượt gửi là hành động KHÔNG rút lại được — người ta đọc rồi. Bản ghi để lại ' +
      'là cách duy nhất sau này trả lời được "tấm thông báo đó từ đâu ra".',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(CreateBroadcastResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [
      ValidationFailedException,
      ['audience.radiusMeters phải lớn hơn 0 khi gửi theo vùng'],
    ],
  )
  public async create(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: CreateBroadcastBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.createUseCase.handle({
          actorUserId: principal.userId,
          audience: body.broadcast.audience,
          title: body.broadcast.title,
          body: body.broadcast.body,
        }),
      )
      .build();
  }

  @Get('broadcasts')
  @RequiresPermission('notification.manage')
  @ApiOperation({
    summary: 'Lịch sử các lượt gửi hàng loạt',
    description:
      'Mới nhất trước. Mỗi dòng mang đủ số liệu để đối soát: số người nhận, số đã gửi, ' +
      'số đã có từ trước, số lỗi, và con trỏ `lastUserId` cho biết lượt gửi đang ở đâu ' +
      'nếu nó còn dở.\n\n' +
      '`alreadySentCount` lớn là **dấu hiệu tốt** khi một lượt gửi được chạy lại — nó ' +
      'nói khoá chống trùng đang làm việc, không phải job gửi trùng.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListBroadcastsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async list(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListBroadcastsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listUseCase.handle({
          actorUserId: principal.userId,
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
        }),
      )
      .build();
  }

  @Post('broadcasts/:broadcastId/send')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequiresPermission('notification.manage')
  @ApiOperation({
    summary: 'Gửi ngay một lượt gửi hàng loạt',
    description:
      'Nút "Gửi ngay" — không phải chờ lượt cron kế tiếp. Trả **202** ngay sau khi NHẬN lượt ' +
      'gửi; phần gửi chạy ở nền, tiến độ xem qua `GET /admin/notifications/broadcasts`.\n\n' +
      '**Không bao giờ gửi đôi.** Nhận một lượt gửi là giữ lease của nó trong một câu lệnh: ' +
      'đang có cron hay Admin khác giữ thì 409 `NOTIFICATION_BROADCAST_IN_PROGRESS` — bấm hai ' +
      'lần, hai tab, hay trùng giờ cron đều ra đúng một người gửi. Tiến trình chết giữa ' +
      'chừng (deploy) thì lease tự hết hạn sau 5 phút và cron gửi tiếp từ con trỏ.\n\n' +
      'Gửi lại được lượt `FAILED` (sau sự cố) — tiếp từ con trỏ, khoá chống trùng chặn gửi ' +
      'lại cho người đã nhận. Lượt `COMPLETED` thì 409 `NOTIFICATION_BROADCAST_ALREADY_COMPLETED`.\n\n' +
      'Ghi audit `SEND_BROADCAST_NOW`. Quyền `notification.manage`.',
  })
  @ApiAcceptedResponse({
    type: ResponseDto.forApi(SendBroadcastNowResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [ValidationFailedException, ['broadcastId must be a UUID']],
    [NotificationBroadcastNotFoundException],
    [NotificationBroadcastAlreadyCompletedException],
    [NotificationBroadcastInProgressException],
  )
  public async sendNow(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: BroadcastIdParamDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.sendNowUseCase.handle({
          actorUserId: principal.userId,
          broadcastId: params.broadcastId,
        }),
      )
      .build();
  }
}
