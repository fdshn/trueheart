import {
  IGetChatFlagPendingCountUseCase,
  IGetChatFlagQueueUseCase,
  IReviewChatFlagUseCase,
} from '@/application/contracts/admin-config';
import { ChatMessageNotFoundException } from '@/domain/exceptions';
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
  Get,
  Inject,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ChatFlagParamDto,
  ChatFlagQueueQueryDto,
  GetChatFlagPendingCountResponseDto,
  GetChatFlagQueueResponseDto,
  ReviewChatFlagBodyDto,
} from '../../dto/admin-config/admin-chat-flag.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - Cờ kiểm duyệt chat')
@ApiBearerAuth()
@Controller('admin/chat/flags')
export class AdminChatFlagController {
  public constructor(
    @Inject(IGetChatFlagQueueUseCase)
    private readonly queueUseCase: IGetChatFlagQueueUseCase,
    @Inject(IGetChatFlagPendingCountUseCase)
    private readonly pendingCountUseCase: IGetChatFlagPendingCountUseCase,
    @Inject(IReviewChatFlagUseCase)
    private readonly reviewUseCase: IReviewChatFlagUseCase,
  ) {}

  @Get()
  @RequiresPermission('report.read')
  @ApiOperation({
    summary: 'Hàng đợi cờ kiểm duyệt chat',
    description:
      'Tin nhắn chat khớp danh sách từ ngữ. Chat **gắn cờ chứ không chặn** (chốt 30/09): tin vẫn tới nơi, Admin xem sau — chat là hội thoại riêng giữa người tặng và người nhận, và một dương tính giả ở đó làm đứng cả cuộc bàn giao. Sắp `BLOCK` trước `REVIEW` rồi cũ trước mới; mức nặng CHỈ để xếp thứ tự. Chỉ hiện tin ĐÃ KHỚP một mục, không phải cả phòng.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException)
  @ApiOkResponse({ type: ResponseDto.forApi(GetChatFlagQueueResponseDto) })
  public async getQueue(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ChatFlagQueueQueryDto,
  ): Promise<ResponseDto<GetChatFlagQueueResponseDto>> {
    const result = await this.queueUseCase.handle({
      actorUserId: principal.userId,
      page: query.page,
      pageSize: query.pageSize,
    });

    return ResponseDto.create<GetChatFlagQueueResponseDto>()
      .succeed()
      .attach(result as never)
      .build();
  }

  @Get('pending-count')
  @RequiresPermission('report.read')
  @ApiOperation({
    summary: 'Số cờ chat chưa xem',
    description:
      'Cho badge Admin, cùng lối với `/admin/comments/pending-count`.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException)
  @ApiOkResponse({
    type: ResponseDto.forApi(GetChatFlagPendingCountResponseDto),
  })
  public async getPendingCount(
    @CurrentUser() principal: IAuthPrincipal,
  ): Promise<ResponseDto<GetChatFlagPendingCountResponseDto>> {
    const result = await this.pendingCountUseCase.handle({
      actorUserId: principal.userId,
    });

    return ResponseDto.create<GetChatFlagPendingCountResponseDto>()
      .succeed()
      .attach(result as never)
      .build();
  }

  @Patch(':flagId/review')
  @RequiresPermission('report.resolve')
  @ApiOperation({
    summary: 'Xử một cờ',
    description:
      'Ghi quyết định và đưa cờ ra khỏi hàng đợi. KHÔNG ghi lại được lên cờ đã xử — làm vậy là xoá quyết định của người trước. Hai Admin bấm cùng lúc thì người thứ hai nhận 404, vì với họ kết luận là "không còn việc ở đây". `MESSAGE_REMOVED` chỉ GHI LẠI quyết định; gỡ tin thật đi qua `DELETE /admin/chat/messages/:messageId`.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    ChatMessageNotFoundException,
  )
  @ApiOkResponse({ type: ResponseDto.forApi(GetChatFlagQueueResponseDto) })
  public async reviewFlag(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: ChatFlagParamDto,
    @Body() body: ReviewChatFlagBodyDto,
  ): Promise<ResponseDto<GetChatFlagQueueResponseDto>> {
    const result = await this.reviewUseCase.handle({
      actorUserId: principal.userId,
      flagId: params.flagId,
      review: body.review,
    });

    return ResponseDto.create<GetChatFlagQueueResponseDto>()
      .succeed()
      .attach(result as never)
      .build();
  }
}
