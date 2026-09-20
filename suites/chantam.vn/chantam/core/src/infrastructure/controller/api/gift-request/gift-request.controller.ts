import {
  ICreateGiftRequestUseCase,
  IListPostRequestsUseCase,
  IWithdrawGiftRequestUseCase,
} from '@/application/contracts/gift-request';
import {
  CannotRequestOwnPostException,
  GiftRequestDuplicatedException,
  GiftRequestNotFoundException,
  PostInvalidStateException,
  PostNotAcceptingRequestsException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  ICreateGiftRequestResponseDto,
  IGetPostRequestsResponseDto,
  IWithdrawGiftRequestResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { CurrentUser, IAuthPrincipal } from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateGiftRequestBodyDto,
  CreateGiftRequestParamDto,
  CreateGiftRequestResponseDto,
  GetPostRequestsResponseDto,
  ListPostRequestsParamDto,
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
  @ApiErrorResponses(
    [GiftRequestNotFoundException, 'Không tìm thấy yêu cầu nhận quà'],
    [PostInvalidStateException, 'Yêu cầu không ở trạng thái PENDING'],
  )
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
  @ApiErrorResponses([PostNotFoundException, 'Post không tồn tại'])
  public async listPostRequests(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: ListPostRequestsParamDto,
  ): Promise<ResponseDto<IGetPostRequestsResponseDto>> {
    const result = await this.listPostRequestsUseCase.handle({
      postId: params.postId,
      currentUserId: principal.userId,
    });

    return ResponseDto.create<IGetPostRequestsResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }
}
