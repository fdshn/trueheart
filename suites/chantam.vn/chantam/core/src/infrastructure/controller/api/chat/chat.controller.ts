import {
  IListChatMessagesUseCase,
  IListChatRoomsUseCase,
  IMarkChatRoomReadUseCase,
  IRecallChatMessageUseCase,
  IRequestChatMediaUploadUseCase,
  ISendChatMessageUseCase,
} from '@/application/contracts/chat';
import {
  ChatMessageNotFoundException,
  ChatRecallWindowClosedException,
  ChatRoomNotFoundException,
  ChatRoomReadOnlyException,
} from '@/domain/exceptions';
import {
  IListChatMessagesResponseDto,
  IListChatRoomsResponseDto,
  IMarkChatRoomReadResponseDto,
  IRequestChatMediaUploadResponseDto,
  ISendChatMessageResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ListChatMessagesParamsDto,
  ListChatMessagesQueryDto,
  ListChatMessagesResponseDto,
  ListChatRoomsQueryDto,
  ListChatRoomsResponseDto,
  MarkChatRoomReadParamsDto,
  MarkChatRoomReadResponseDto,
  RecallChatMessageParamsDto,
  RecallChatMessageResponseDto,
  RequestChatMediaUploadBodyDto,
  RequestChatMediaUploadResponseDto,
  SendChatMessageBodyDto,
  SendChatMessageParamsDto,
  SendChatMessageResponseDto,
} from '../../dto/chat';

@ApiTags('Chat')
@Controller('chat')
export class ChatController {
  public constructor(
    @Inject(IRecallChatMessageUseCase)
    private readonly recallChatMessageUseCase: IRecallChatMessageUseCase,
    @Inject(IListChatRoomsUseCase)
    private readonly listChatRoomsUseCase: IListChatRoomsUseCase,
    @Inject(IListChatMessagesUseCase)
    private readonly listChatMessagesUseCase: IListChatMessagesUseCase,
    @Inject(IRequestChatMediaUploadUseCase)
    private readonly requestChatMediaUploadUseCase: IRequestChatMediaUploadUseCase,
    @Inject(ISendChatMessageUseCase)
    private readonly sendChatMessageUseCase: ISendChatMessageUseCase,
    @Inject(IMarkChatRoomReadUseCase)
    private readonly markChatRoomReadUseCase: IMarkChatRoomReadUseCase,
  ) {}

  @Get('rooms')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Danh sách hội thoại của chính mình',
    description:
      'Mỗi giao dịch đã duyệt có đúng một phòng. Phòng chưa ai nói vẫn hiện, nằm sau các phòng có tin nhắn. `unreadCount` tính theo mốc đã đọc của chính người gọi và không đếm tin họ tự gửi.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListChatRoomsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors)
  public async listRooms(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListChatRoomsQueryDto,
  ): Promise<ResponseDto<IListChatRoomsResponseDto>> {
    const result = await this.listChatRoomsUseCase.handle({
      ...query,
      userId: principal.userId,
    });

    return ResponseDto.create<IListChatRoomsResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  // PHẢI đứng trước `rooms/:roomId` nếu sau này có route tĩnh khác; hiện tại
  // các route dưới đều mang hậu tố cố định nên không tranh chấp.
  @Get('rooms/:roomId/messages')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lịch sử tin nhắn của một phòng',
    description:
      'Mới nhất trước. Chỉ hai bên của giao dịch đọc được; người ngoài nhận CHAT_ROOM_NOT_FOUND giống như phòng không tồn tại, để không lộ ai đang trao đổi với ai. ' +
      'Phân trang bằng CON TRỎ, không phải `page`/`pageSize`: chat được thêm vào ĐẦU, nên mỗi tin mới đến làm cửa sổ OFFSET trôi xuống một dòng và trang sau sẽ lặp lại tin người dùng vừa xem. ' +
      'Không truyền gì thì trả về cửa sổ mới nhất; cuộn lên thì truyền `before` = `window.oldestCursor`; bắt kịp sau khi mất kết nối thì truyền `after` = `window.newestCursor`. ' +
      'Trần `limit` là 50 — không có cách nào xin cả phòng trong một lần gọi.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListChatMessagesResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, ChatRoomNotFoundException)
  public async listMessages(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: ListChatMessagesParamsDto,
    @Query() query: ListChatMessagesQueryDto,
  ): Promise<ResponseDto<IListChatMessagesResponseDto>> {
    const result = await this.listChatMessagesUseCase.handle({
      ...params,
      ...query,
      userId: principal.userId,
    });

    return ResponseDto.create<IListChatMessagesResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Post('rooms/:roomId/messages')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gửi tin nhắn',
    description:
      'Chỉ gửi được khi phòng còn OPEN. Giao dịch kết thúc thì phòng thành chỉ đọc và trả CHAT_ROOM_READ_ONLY (F38). Người nhận được ghi một thông báo trong app, và đẩy push nếu đã cấu hình nhà cung cấp (F44).',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(SendChatMessageResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [
      ValidationFailedException,
      ['message.body: body must be longer than or equal to 1 characters'],
    ],
    ChatRoomNotFoundException,
    ChatRoomReadOnlyException,
  )
  public async sendMessage(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: SendChatMessageParamsDto,
    @Body() body: SendChatMessageBodyDto,
  ): Promise<ResponseDto<ISendChatMessageResponseDto>> {
    const result = await this.sendChatMessageUseCase.handle({
      ...params,
      ...body,
      userId: principal.userId,
      username: principal.username,
    });

    return ResponseDto.create<ISendChatMessageResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Post('rooms/:roomId/message-media/upload-url')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đường tải ảnh cho tin nhắn chat',
    description:
      'Cấp presigned PUT — máy chủ không nhận file. Khoá theo PHÒNG chứ không theo tin nhắn, vì chat chỉ ghi thêm: tin được tạo cùng lúc với ảnh nên lúc này nó chưa tồn tại. ' +
      'PUT xong thì gửi `key` trong `message.mediaKeys` lúc gửi tin. Tối đa 3 ảnh, trần do database giữ. ' +
      'Chỉ người trong phòng xin được đường tải.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(RequestChatMediaUploadResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors, ChatRoomNotFoundException)
  public async requestMessageMediaUpload(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: SendChatMessageParamsDto,
    @Body() body: RequestChatMediaUploadBodyDto,
  ): Promise<ResponseDto<IRequestChatMediaUploadResponseDto>> {
    const result = await this.requestChatMediaUploadUseCase.handle({
      userId: principal.userId,
      roomId: params.roomId,
      contentType: body.upload.contentType,
      contentLength: body.upload.contentLength,
    });

    return ResponseDto.create<IRequestChatMediaUploadResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Delete('rooms/:roomId/messages/:messageId')
  @ApiOperation({
    summary: 'Thu hồi một tin nhắn vừa gửi',
    description:
      'Chỉ người ĐÃ GỬI, và chỉ trong vòng 5 phút. KHÔNG xoá dòng: bảng tin nhắn cấm sửa/xoá để không ai âm thầm viết lại lịch sử trao đổi, và chính lịch sử đó là bằng chứng khi tranh chấp. Thu hồi chỉ làm rỗng nội dung và đặt `recalledAt`, nên dòng vẫn giữ chỗ trong cuộc trò chuyện. Ảnh đính kèm bị xoá khỏi storage — thu hồi mà để ảnh vẫn mở được bằng đường dẫn công khai thì chữ biến mất còn thứ đáng lo nhất vẫn nằm đó.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(RecallChatMessageResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ChatMessageNotFoundException],
    [ChatRecallWindowClosedException, [5]],
  )
  public async recallMessage(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: RecallChatMessageParamsDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.recallChatMessageUseCase.handle({
          roomId: params.roomId,
          messageId: params.messageId,
          userId: principal.userId,
          username: principal.username,
        }),
      )
      .build();
  }

  @Patch('rooms/:roomId/read')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đánh dấu đã đọc tới hiện tại',
    description:
      'Đặt mốc đã đọc của chính người gọi. Phòng chỉ đọc vẫn đánh dấu được — đọc lại lịch sử là việc hợp lệ sau khi giao dịch xong.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(MarkChatRoomReadResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, ChatRoomNotFoundException)
  public async markRead(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: MarkChatRoomReadParamsDto,
  ): Promise<ResponseDto<IMarkChatRoomReadResponseDto>> {
    const result = await this.markChatRoomReadUseCase.handle({
      ...params,
      userId: principal.userId,
    });

    return ResponseDto.create<IMarkChatRoomReadResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }
}
