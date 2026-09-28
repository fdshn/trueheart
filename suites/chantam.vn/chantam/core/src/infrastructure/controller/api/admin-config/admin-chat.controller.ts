import { IReadAdminChatRoomUseCase } from '@/application/contracts/chat';
import { ChatRoomNotFoundException } from '@/domain/exceptions';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AdminChatRoomParamsDto,
  AdminChatRoomQueryDto,
  AdminChatRoomResponseDto,
} from '../../dto/admin-config/admin-chat.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Quản trị — phòng chat')
@ApiBearerAuth()
@Controller('admin/chat')
export class AdminChatController {
  public constructor(
    @Inject(IReadAdminChatRoomUseCase)
    private readonly readAdminChatRoomUseCase: IReadAdminChatRoomUseCase,
  ) {}

  @Get('rooms/:roomId/messages')
  @RequiresPermission('report.read')
  @ApiOperation({
    summary: 'Đọc một phòng chat để điều tra báo xấu',
    description:
      'CHỈ mở được khi có một báo xấu **đang mở** trỏ vào phòng này — nhắm vào một trong hai người, vào bài của lượt trao, hoặc vào một tin nhắn trong chính phòng. Không có báo xấu nào thì trả 404 y như phòng không tồn tại, nên không ai dò được phòng nào có thật. Mỗi lần mở đều ghi audit `READ_CHAT_ROOM`: quyền đọc chỗ riêng tư mà không để lại vết là quyền không ai kiểm soát được. Trước 28/09 không endpoint nào đọc được phòng chat, kể cả Admin — nên người bị quấy rối báo xấu xong thì Admin không có gì để xem ngoài lời khai.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(AdminChatRoomResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [ChatRoomNotFoundException],
  )
  public async readRoom(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: AdminChatRoomParamsDto,
    @Query() query: AdminChatRoomQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.readAdminChatRoomUseCase.handle({
          actorUserId: principal.userId,
          roomId: params.roomId,
          limit: query.limit ?? 200,
        }),
      )
      .build();
  }
}
