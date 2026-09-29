import {
  IReadAdminChatRoomUseCase,
  IRemoveChatMessageUseCase,
} from '@/application/contracts/chat';
import {
  ChatMessageNotFoundException,
  ChatRoomNotFoundException,
} from '@/domain/exceptions';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Query,
} from '@nestjs/common';
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
  RemoveChatMessageBodyDto,
  RemoveChatMessageParamDto,
  RemoveChatMessageResponseDto,
} from '../../dto/admin-config/admin-chat.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Quản trị — phòng chat')
@ApiBearerAuth()
@Controller('admin/chat')
export class AdminChatController {
  public constructor(
    @Inject(IReadAdminChatRoomUseCase)
    private readonly readAdminChatRoomUseCase: IReadAdminChatRoomUseCase,
    @Inject(IRemoveChatMessageUseCase)
    private readonly removeChatMessageUseCase: IRemoveChatMessageUseCase,
  ) {}

  @Delete('messages/:messageId')
  @RequiresPermission('report.resolve')
  @ApiOperation({
    summary: 'Gỡ một tin nhắn bị báo xấu',
    description:
      'Đóng nốt cửa thứ ba của việc báo xấu tin nhắn. Trước 29/09 nạn nhân báo được đúng một dòng tin nhắn và Admin đọc được phòng làm bằng chứng, nhưng KHÔNG có đường nào gỡ — câu chữ đó nằm trong phòng vĩnh viễn, cả hai vẫn đọc lại được. ' +
      '`PATCH /chat/rooms/:roomId/messages/:messageId/recall` không phải đường này: nó đòi người gọi LÀ người gửi và trong 5 phút — cửa sổ đó để người gửi chữa lỗi gõ nhầm, không phải để giới hạn quyền kiểm duyệt. ' +
      'Đi qua đúng cờ phiên mà trigger append-only cho phép, nên bản ghi sau khi gỡ có hình dạng giống hệt một lượt thu hồi; không mở thêm lối ghi nào vào bảng append-only. Ảnh kèm bị xoá khỏi storage, hai thiết bị nhận realtime để xoá ngay. `reason` bắt buộc, ghi audit `REMOVE_CHAT_MESSAGE`. ' +
      'Cần quyền `report.resolve`, KHÔNG phải `report.read`: mở hàng đợi để xem bằng chứng và xoá nội dung của người khác là hai quyền khác nhau.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(RemoveChatMessageResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [ChatMessageNotFoundException, 'Không còn gì để gỡ, hoặc đã gỡ trước đó'],
  )
  public async removeMessage(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: RemoveChatMessageParamDto,
    @Body() body: RemoveChatMessageBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.removeChatMessageUseCase.handle({
          actorUserId: principal.userId,
          messageId: params.messageId,
          reason: body.removal.reason,
        }),
      )
      .build();
  }

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
