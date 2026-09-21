import {
  IAcceptGiftRequestUseCase,
  ICreateGiftRequestUseCase,
  IListPostRequestsUseCase,
  IWithdrawGiftRequestUseCase,
} from '@/application/contracts/gift-request';
import {
  CannotRequestOwnPostException,
  GiftRequestDuplicatedException,
  GiftRequestNotFoundException,
  GiftTransactionInvalidStateException,
  GiftTransactionOutOfStockException,
  PostInvalidStateException,
  PostNotAcceptingRequestsException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  IAcceptGiftRequestResponseDto,
  ICreateGiftRequestResponseDto,
  IGetPostRequestsResponseDto,
  IWithdrawGiftRequestResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
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
  AcceptGiftRequestParamDto,
  AcceptGiftRequestResponseDto,
  CreateGiftRequestBodyDto,
  CreateGiftRequestParamDto,
  CreateGiftRequestResponseDto,
  GetPostRequestsResponseDto,
  ListPostRequestsParamDto,
  ListPostRequestsQueryDto,
  WithdrawGiftRequestParamDto,
  WithdrawGiftRequestResponseDto,
} from '../../dto/gift-request';

@ApiTags('Yêu cầu nhận quà')
@Controller('posts')
export class GiftRequestController {
  public constructor(
    @Inject(ICreateGiftRequestUseCase)
    private readonly createGiftRequestUseCase: ICreateGiftRequestUseCase,
    @Inject(IWithdrawGiftRequestUseCase)
    private readonly withdrawGiftRequestUseCase: IWithdrawGiftRequestUseCase,
    @Inject(IListPostRequestsUseCase)
    private readonly listPostRequestsUseCase: IListPostRequestsUseCase,
    @Inject(IAcceptGiftRequestUseCase)
    private readonly acceptGiftRequestUseCase: IAcceptGiftRequestUseCase,
  ) {}

  @Post(':postId/requests')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gửi yêu cầu xin nhận đồ',
    description:
      'Người dùng gửi yêu cầu xin đồ (kèm lời nhắn tối đa 500 ký tự). Mỗi người chỉ có 1 yêu cầu hiệu lực cho 1 bài.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(CreateGiftRequestResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [
      ValidationFailedException,
      ['message: message must be longer than or equal to 1 characters'],
    ],
    [PostNotFoundException, 'Post không tồn tại'],
    [
      CannotRequestOwnPostException,
      'Không thể gửi yêu cầu xin nhận bài đăng của chính mình',
    ],
    [
      PostNotAcceptingRequestsException,
      'Bài đăng hiện không tiếp nhận yêu cầu',
    ],
    [GiftRequestDuplicatedException, 'Bạn đã gửi yêu cầu cho bài đăng này rồi'],
  )
  public async createGiftRequest(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CreateGiftRequestParamDto,
    @Body() body: CreateGiftRequestBodyDto,
  ): Promise<ResponseDto<ICreateGiftRequestResponseDto>> {
    const result = await this.createGiftRequestUseCase.handle({
      postId: params.postId,
      requesterId: principal.userId,
      message: body.message,
    });

    return ResponseDto.create<ICreateGiftRequestResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Post(':postId/requests/withdraw')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Rút yêu cầu xin nhận đồ',
    description:
      'Người dùng tự rút lại yêu cầu xin đồ nếu đang ở trạng thái PENDING.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(WithdrawGiftRequestResponseDto),
  })
  // Không còn PENDING, hoặc không tồn tại, đều trả về cùng một lỗi: câu UPDATE
  // có điều kiện không phân biệt được hai trường hợp, và cũng không cần.
  @ApiErrorResponses(...ApiTokenErrors, [
    GiftRequestNotFoundException,
    'Không tìm thấy yêu cầu nhận quà',
  ])
  public async withdrawGiftRequest(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: WithdrawGiftRequestParamDto,
  ): Promise<ResponseDto<IWithdrawGiftRequestResponseDto>> {
    const result = await this.withdrawGiftRequestUseCase.handle({
      postId: params.postId,
      requesterId: principal.userId,
    });

    return ResponseDto.create<IWithdrawGiftRequestResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Get(':postId/requests')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Danh sách người xin nhận đồ',
    description:
      'Chỉ tác giả của bài đăng mới có thể xem danh sách các yêu cầu nhận đồ.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetPostRequestsResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [PostNotFoundException, 'Post không tồn tại'],
    [ForbiddenException],
  )
  public async listPostRequests(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: ListPostRequestsParamDto,
    @Query() query: ListPostRequestsQueryDto,
  ): Promise<ResponseDto<IGetPostRequestsResponseDto>> {
    const result = await this.listPostRequestsUseCase.handle({
      ...query,
      postId: params.postId,
      currentUserId: principal.userId,
    });

    return ResponseDto.create<IGetPostRequestsResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Post(':postId/requests/:requestId/accept')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Duyệt người xin nhận đồ (Chọn ứng viên)',
    description:
      'Chỉ tác giả của bài đăng mới có thể duyệt người xin nhận. Yêu cầu được duyệt chuyển sang ACCEPTED và một lượt giao dịch được tạo. Bài đăng CHỈ chuyển sang DELIVERING khi đã hết số lượng — còn hàng thì vẫn PUBLISHED để người khác tiếp tục xin, và chỉ khi hết hàng mới từ chối hàng loạt các yêu cầu PENDING còn lại.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(AcceptGiftRequestResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [PostNotFoundException, 'Post không tồn tại'],
    [GiftRequestNotFoundException, 'Không tìm thấy yêu cầu nhận quà'],
    [PostInvalidStateException, 'Bài đăng không ở trạng thái hợp lệ để duyệt'],
    [ForbiddenException],
    [GiftTransactionOutOfStockException],
    // Lượt bàn giao đã được duyệt ở luồng /transactions rồi.
    [GiftTransactionInvalidStateException, 'ACCEPTED'],
  )
  public async acceptGiftRequest(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: AcceptGiftRequestParamDto,
  ): Promise<ResponseDto<IAcceptGiftRequestResponseDto>> {
    const result = await this.acceptGiftRequestUseCase.handle({
      postId: params.postId,
      requestId: params.requestId,
      userId: principal.userId,
    });

    return ResponseDto.create<IAcceptGiftRequestResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }
}
