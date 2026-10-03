import {
  ICreateBroadcastUseCase,
  IListBroadcastsUseCase,
} from '@/application/contracts/notification';
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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateBroadcastBodyDto,
  CreateBroadcastResponseDto,
  ListBroadcastsQueryDto,
  ListBroadcastsResponseDto,
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
  ) {}

  @Post('broadcasts')
  @RequiresPermission('notification.manage')
  @ApiOperation({
    summary: 'Xếp một lượt gửi thông báo hàng loạt',
    description:
      'Endpoint này **KHÔNG gửi gì** — nó ghi một lượt gửi ở trạng thái `PENDING` rồi ' +
      'trả ngay, kèm số người nhận đã đếm trước. `npm run notify:broadcast` mới là chỗ ' +
      'gửi thật.\n\n' +
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
}
