import { IGetForumEngagementLeaderboardUseCase } from '@/application/contracts/dharma';
import { Public } from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  DharmaLeaderboardQueryDto,
  ForumEngagementLeaderboardResponseDto,
} from '../../dto/dharma/dharma-leaderboard.dto';

/** `@ApiErrorResponses` dựng exception để lấy mã — exception này cần danh sách lỗi mẫu. */
const MonthErrorSample = ['month: phải có dạng YYYY-MM'];

/**
 * Bảng xếp hạng Phật Pháp (PR #46 §11) — công khai, tính sống, không trả `userId`.
 *
 * File riêng: `route-order-guard` quét theo file, và `leaderboards/...` không được nằm chung
 * với `contents/:idOrSlug` hay `threads/:id`.
 */
@ApiTags('Phật Pháp')
@Controller('dharma/leaderboards')
export class DharmaLeaderboardController {
  public constructor(
    @Inject(IGetForumEngagementLeaderboardUseCase)
    private readonly forumEngagement: IGetForumEngagementLeaderboardUseCase,
  ) {}

  @Get('forum-engagement')
  @Public()
  @ApiOperation({
    summary: 'Tác giả có chủ đề diễn đàn được tương tác nhiều nhất trong tháng',
    description:
      '`engagementCount` = cảm xúc + bình luận (kể cả trả lời) người KHÁC để lại trong tháng (giờ Việt Nam) ' +
      'trên các chủ đề đang hiện; tương tác của chính tác giả không tính, bình luận bị ẩn/gỡ/chờ duyệt không tính. ' +
      'Hoà thì ai đạt tương tác cuối sớm hơn đứng trước. Chỉ tài khoản đang hoạt động. ' +
      'Người bật ẩn danh trên bảng thành tích hiện không tên và không kèm chủ đề.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(ForumEngagementLeaderboardResponseDto),
  })
  @ApiErrorResponses([ValidationFailedException, MonthErrorSample])
  public async forumEngagementLeaderboard(
    @Query() query: DharmaLeaderboardQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.forumEngagement.handle({
          month: query.month,
          limit: query.limit,
        }),
      )
      .build();
  }
}
