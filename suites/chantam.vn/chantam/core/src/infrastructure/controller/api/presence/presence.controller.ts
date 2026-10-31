import {
  IGetSurfacePresenceUseCase,
  IPresenceHeartbeatUseCase,
} from '@/application/contracts/presence';
import { TooManyRequestsException } from '@/domain/exceptions';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
  Public,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
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
  PresenceHeartbeatBodyDto,
  PresenceHeartbeatResponseDto,
  PresenceSurfaceParamsDto,
  PresenceSurfaceQueryDto,
  SurfacePresenceResponseDto,
} from '../../dto/presence';

/**
 * Số người đang ở từng tab (PR #46 §10). REST heartbeat + Redis, chấp nhận trễ 1–2 phút —
 * WebSocket vẫn chỉ dành cho chat.
 */
@ApiTags('Presence')
@Controller('presence')
export class PresenceController {
  public constructor(
    @Inject(IPresenceHeartbeatUseCase)
    private readonly heartbeatUseCase: IPresenceHeartbeatUseCase,
    @Inject(IGetSurfacePresenceUseCase)
    private readonly getSurfaceUseCase: IGetSurfacePresenceUseCase,
  ) {}

  @Put('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Heartbeat: tôi đang ở tab nào',
    description:
      'Gọi khi vào tab và mỗi 60 giây khi app foreground; background thì ngừng, không cần gọi rời tab. ' +
      'Heartbeat mới thay tab hiện tại của cùng `sessionId`; hết 120 giây không heartbeat là tự rời. ' +
      'Lặp cùng tab sớm hơn 30 giây thì bỏ qua êm (`refreshed: false`). Không lưu lịch sử, không ghi PostgreSQL.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(PresenceHeartbeatResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [
      ValidationFailedException,
      ['presence.surface: surface must be one of the following values'],
    ],
    [TooManyRequestsException, 60],
  )
  public async heartbeat(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: PresenceHeartbeatBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.heartbeatUseCase.handle({
          userId: principal.userId,
          sessionId: body.presence.sessionId,
          surface: body.presence.surface,
        }),
      )
      .build();
  }

  @Public()
  @Get('surfaces/:surface')
  @ApiOperation({
    summary: 'Số người đang ở một tab',
    description:
      'Gọi khi mở tab, kéo làm mới, hoặc mỗi 60–120 giây khi màn còn hiển thị; không gọi khi app background. ' +
      '`onlineCount` đếm mọi người (gộp nhiều thiết bị của một người). `visibleUsers`: tối đa `limit` người (mặc định 10) ' +
      'đã bật `showOnlineStatus` trong hồ sơ, tài khoản đang hoạt động, người heartbeat gần nhất trước. ' +
      'Gửi kèm token thì mỗi người có thêm `userId` (để mở chat trực tiếp), không có chính người gọi và không có ai có quan hệ chặn với người gọi; ' +
      'khách chưa đăng nhập không nhận `userId`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(SurfacePresenceResponseDto) })
  @ApiErrorResponses([
    ValidationFailedException,
    ['surface: surface must be one of the following values'],
  ])
  public async getSurface(
    @Param() params: PresenceSurfaceParamsDto,
    @Query() query: PresenceSurfaceQueryDto,
    @CurrentUser() principal?: IAuthPrincipal,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getSurfaceUseCase.handle({
          surface: params.surface,
          currentUserId: principal?.userId,
          limit: query.limit,
        }),
      )
      .build();
  }
}
