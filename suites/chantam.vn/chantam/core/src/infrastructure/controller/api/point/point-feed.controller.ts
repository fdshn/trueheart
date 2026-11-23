import { IGetPointFeedUseCase } from '@/application/contracts/point';
import {
  TooManyRequestsException,
  UserNotFoundException,
} from '@/domain/exceptions';
import { PointFeedDefaultLimit } from '@chantam.vn/chantam.core-lib/models';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  PointFeedQueryDto,
  PointFeedResponseDto,
  UserPointFeedParamsDto,
  UserPointFeedResponseDto,
} from '../../dto/point';

const ok = <T>(body: T) => ResponseDto.create().succeed().attach(body).build();

/** Bảng tin điểm công khai (CR 22/11/2026) — polling. */
@ApiTags('Điểm')
@ApiBearerAuth()
@Controller()
export class PointFeedController {
  public constructor(
    @Inject(IGetPointFeedUseCase)
    private readonly feedUseCase: IGetPointFeedUseCase,
  ) {}

  @Get('points/feed')
  @ApiOperation({
    summary: 'Bảng tin điểm chung',
    description:
      'Ai vừa được cộng điểm vì việc gì. Chỉ bút toán DƯƠNG của rule thưởng, (gốc + thưởng hệ số) ≥ `point.feed_min_delta`; không bao giờ có phạt, điều chỉnh tay, đảo, đổi điểm, lý do hay id tham chiếu. Người tắt `showInPublicPointFeed`, bị khoá hay đã xoá không xuất hiện. Polling: lần đầu bỏ `afterId` (dòng mới nhất), sau đó gửi `afterId = latestId` mỗi `pollAfterSeconds` giây; hiện từng dòng cách nhau `displayIntervalMs`. Đệm 5 giây; 30 lượt/phút/người.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(PointFeedResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, TooManyRequestsException)
  public async feed(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: PointFeedQueryDto,
  ) {
    return ok(
      await this.feedUseCase.handle({
        viewerId: principal.userId,
        userId: null,
        afterId: query.afterId ?? null,
        limit: query.limit ?? PointFeedDefaultLimit,
      }),
    );
  }

  @Get('users/:userId/points/feed')
  @ApiOperation({
    summary: 'Bảng tin điểm của một người',
    description:
      'Như bảng tin chung nhưng không áp ngưỡng, kèm `balance`/`lifetime`. Người đã tắt `showInPublicPointFeed`, bị khoá hay đã xoá → `404` với người khác; chính chủ luôn xem được.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(UserPointFeedResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    UserNotFoundException,
    TooManyRequestsException,
  )
  public async userFeed(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: UserPointFeedParamsDto,
    @Query() query: PointFeedQueryDto,
  ) {
    return ok(
      await this.feedUseCase.handle({
        viewerId: principal.userId,
        userId: params.userId,
        afterId: query.afterId ?? null,
        limit: query.limit ?? PointFeedDefaultLimit,
      }),
    );
  }
}
