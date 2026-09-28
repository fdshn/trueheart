import { IListMyGiftRequestsUseCase } from '@/application/contracts/gift-request';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ListMyGiftRequestsQueryDto,
  ListMyGiftRequestsResponseDto,
} from '../../dto/gift-request/my-gift-requests.dto';

/**
 * Yêu cầu xin nhận, nhìn từ phía NGƯỜI XIN.
 *
 * Controller riêng vì đường dẫn không treo dưới một bài nào: `GiftRequestController`
 * là `@Controller('posts')`, và nhét `requests/me` vào đó sẽ thành
 * `/posts/requests/me` — một đường dẫn nói sai về thứ nó trả.
 */
@ApiTags('Yêu cầu nhận quà')
@Controller('requests')
export class MyGiftRequestController {
  public constructor(
    @Inject(IListMyGiftRequestsUseCase)
    private readonly listMyGiftRequestsUseCase: IListMyGiftRequestsUseCase,
  ) {}

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Những yêu cầu xin nhận của chính tôi',
    description:
      'Trước 28/09 không có màn hình nào cho việc này: người dùng không có cách nào biết mình đang xin những gì. Ghép với trần `OPEN_REQUEST_QUOTA` thì thành bẫy kín — một yêu cầu treo dưới bài đã hết hạn vẫn ăn một suất, mà họ không tìm ra nó để rút. Mỗi dòng kèm tiêu đề, ảnh và trạng thái BÀI, cùng cờ `postClosed`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListMyGiftRequestsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors)
  public async listMine(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListMyGiftRequestsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listMyGiftRequestsUseCase.handle({
          requesterId: principal.userId,
          status: query.status,
          page: query.page ?? 1,
          pageSize: query.pageSize ?? 20,
        }),
      )
      .build();
  }
}
