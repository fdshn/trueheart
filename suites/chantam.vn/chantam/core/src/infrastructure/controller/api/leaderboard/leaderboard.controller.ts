import {
  IGetMonthlyLeaderboardUseCase,
  IGetMyLeaderboardPositionsUseCase,
  IListLeaderboardMonthsUseCase,
} from '@/application/contracts/leaderboard';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
  Public,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  GetMonthlyLeaderboardQueryDto,
  LeaderboardMonthQueryDto,
  LeaderboardMonthsDto,
  MonthlyLeaderboardDto,
  MyLeaderboardPositionsDto,
} from '../../dto/leaderboard';

/** `@ApiErrorResponses` dựng exception để lấy mã — exception này cần danh sách lỗi mẫu. */
const MonthErrorSample = ['month: phải có dạng YYYY-MM'];

/**
 * Bảng thành tích tháng — ba bảng Người cho, Tấm lòng từ thiện, Chuyên cần.
 *
 * Không route nào có tham số đường dẫn: `route-order-guard` quét theo file, và
 * `/leaderboards/monthly/me` không được rơi vào một `:param`.
 */
@ApiTags('Bảng thành tích')
@Controller('leaderboards')
export class LeaderboardController {
  public constructor(
    @Inject(IGetMonthlyLeaderboardUseCase)
    private readonly getLeaderboard: IGetMonthlyLeaderboardUseCase,
    @Inject(IGetMyLeaderboardPositionsUseCase)
    private readonly getMyPositions: IGetMyLeaderboardPositionsUseCase,
    @Inject(IListLeaderboardMonthsUseCase)
    private readonly listMonths: IListLeaderboardMonthsUseCase,
  ) {}

  @Public()
  @Get('monthly')
  @ApiOperation({
    summary: 'Một bảng thành tích của một tháng',
    description:
      'Đếm SỐ LẦN, không đếm điểm hay tiền. Tháng tính theo giờ Việt Nam. Hai người bằng nhau thì ai đạt con số đó SỚM hơn đứng trên.\n\n' +
      '`status=LIVE`: tháng chưa chốt, tính trực tiếp (trễ tối đa ~1 phút). `status=CLOSED`: đã chốt lúc 00:05 ngày 1 tháng sau, không đổi nữa.\n\n' +
      'Người chọn ẩn danh hiện `isAnonymous=true`, `user=null` — vẫn giữ đúng hạng. Không dòng nào mang `userId`.\n\n' +
      'Gửi kèm token thì có thêm `me` — dòng của chính mình, đủ danh tính.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(MonthlyLeaderboardDto) })
  @ApiErrorResponses([ValidationFailedException, MonthErrorSample])
  public async getMonthly(
    @CurrentUser() principal: IAuthPrincipal | null,
    @Query() query: GetMonthlyLeaderboardQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getLeaderboard.handle({
          viewerId: principal?.userId ?? null,
          board: query.board,
          month: query.month,
          page: query.page,
          pageSize: query.pageSize,
        }),
      )
      .build();
  }

  @Get('monthly/me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Vị trí của tôi trên cả ba bảng',
    description:
      '`rank=null` khi chưa đủ sàn của bảng (`minCount`). `gapToBadge`: còn thiếu bao nhiêu để bằng hạng cuối nhận huy hiệu (`badgeRanks`); `gapToNext`: còn thiếu bao nhiêu để bằng người ngay trên.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(MyLeaderboardPositionsDto) })
  @ApiErrorResponses(...ApiTokenErrors, [
    ValidationFailedException,
    MonthErrorSample,
  ])
  public async getMine(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: LeaderboardMonthQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getMyPositions.handle({
          userId: principal.userId,
          month: query.month,
        }),
      )
      .build();
  }

  @Public()
  @Get('months')
  @ApiOperation({
    summary: 'Các tháng đã chốt',
    description:
      'Mới nhất trước, để dựng bộ chọn tháng. Tháng hiện tại không nằm ở đây.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(LeaderboardMonthsDto) })
  public async getMonths() {
    return ResponseDto.create()
      .succeed()
      .attach(await this.listMonths.handle({}))
      .build();
  }
}
