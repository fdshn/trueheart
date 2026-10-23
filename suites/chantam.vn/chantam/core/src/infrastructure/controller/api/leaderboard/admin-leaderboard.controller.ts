import {
  ICreateLeaderboardExclusionUseCase,
  IGetAdminMonthlyLeaderboardUseCase,
  IListAdminBadgesUseCase,
  IListLeaderboardExclusionsUseCase,
  IRemoveLeaderboardExclusionUseCase,
  IRevokeLeaderboardBadgeUseCase,
} from '@/application/contracts/leaderboard';
import {
  LeaderboardBadgeNotFoundException,
  LeaderboardExclusionExistsException,
  LeaderboardExclusionNotFoundException,
  LeaderboardMonthClosedException,
  UserNotFoundException,
} from '@/domain/exceptions';
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
  AdminBadgeWrapperDto,
  AdminMonthlyLeaderboardDto,
  AdminMonthlyLeaderboardQueryDto,
  BadgeIdParamDto,
  CreateLeaderboardExclusionBodyDto,
  ExclusionIdParamDto,
  LeaderboardExclusionWrapperDto,
  ListAdminBadgesQueryDto,
  ListAdminBadgesResponseDto,
  ListLeaderboardExclusionsQueryDto,
  ListLeaderboardExclusionsResponseDto,
  RevokeBadgeBodyDto,
} from '../../dto/leaderboard';
import { RequiresPermission } from '../../guards';

/** `@ApiErrorResponses` dựng exception để lấy mã — exception này cần danh sách lỗi mẫu. */
const MonthErrorSample = ['month: phải có dạng YYYY-MM'];

/**
 * Bảng thành tích tháng phía Admin. Route tĩnh (`monthly`, `exclusions`) đứng trước route
 * có tham số trong cùng file — `route-order-guard` quét theo file.
 */
@ApiTags('Admin - Bảng thành tích')
@ApiBearerAuth()
@Controller('admin')
export class AdminLeaderboardController {
  public constructor(
    @Inject(IGetAdminMonthlyLeaderboardUseCase)
    private readonly getLeaderboard: IGetAdminMonthlyLeaderboardUseCase,
    @Inject(IListLeaderboardExclusionsUseCase)
    private readonly listExclusions: IListLeaderboardExclusionsUseCase,
    @Inject(ICreateLeaderboardExclusionUseCase)
    private readonly createExclusion: ICreateLeaderboardExclusionUseCase,
    @Inject(IRemoveLeaderboardExclusionUseCase)
    private readonly removeExclusion: IRemoveLeaderboardExclusionUseCase,
    @Inject(IListAdminBadgesUseCase)
    private readonly listBadges: IListAdminBadgesUseCase,
    @Inject(IRevokeLeaderboardBadgeUseCase)
    private readonly revokeBadge: IRevokeLeaderboardBadgeUseCase,
  ) {}

  @Get('leaderboards/monthly')
  @RequiresPermission('leaderboard.read')
  @ApiOperation({
    summary: 'Bảng thành tích với danh tính thật',
    description:
      'Như `GET /leaderboards/monthly` nhưng LUÔN có `userId` và danh tính, kể cả người ẩn danh (`isAnonymous` vẫn cho biết họ đã chọn ẩn). ' +
      'Tháng chưa chốt hiện cả người bị loại (`excluded=true`). Xem được cả khi tính năng đang tắt.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException, [
    ValidationFailedException,
    MonthErrorSample,
  ])
  @ApiOkResponse({ type: ResponseDto.forApi(AdminMonthlyLeaderboardDto) })
  public async getMonthly(@Query() query: AdminMonthlyLeaderboardQueryDto) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getLeaderboard.handle({
          board: query.board,
          month: query.month,
          page: query.page,
          pageSize: query.pageSize,
        }),
      )
      .build();
  }

  @Get('leaderboards/exclusions')
  @RequiresPermission('leaderboard.read')
  @ApiOperation({
    summary: 'Danh sách lượt loại khỏi bảng',
    description: 'Mới nhất trước, gồm cả lượt đã bỏ (`removedAt`).',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException)
  @ApiOkResponse({
    type: ResponseDto.forApi(ListLeaderboardExclusionsResponseDto),
  })
  public async getExclusions(
    @Query() query: ListLeaderboardExclusionsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listExclusions.handle({
          month: query.month,
          board: query.board,
          page: query.page,
          pageSize: query.pageSize,
        }),
      )
      .build();
  }

  @Post('leaderboards/exclusions')
  @RequiresPermission('leaderboard.moderate')
  @ApiOperation({
    summary: 'Loại một người khỏi bảng của một tháng',
    description:
      'Chỉ tháng CHƯA chốt (`LEADERBOARD_MONTH_CLOSED` nếu đã chốt — khi đó gỡ huy hiệu thay vì loại). `board` bỏ trống = cả ba bảng. Bắt buộc `reason`, có ghi audit.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    LeaderboardMonthClosedException,
    LeaderboardExclusionExistsException,
    UserNotFoundException,
    [ValidationFailedException, MonthErrorSample],
  )
  @ApiCreatedResponse({
    type: ResponseDto.forApi(LeaderboardExclusionWrapperDto),
  })
  public async postExclusion(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: CreateLeaderboardExclusionBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.createExclusion.handle({
          actorUserId: principal.userId,
          month: body.exclusion.month,
          board: body.exclusion.board ?? null,
          userId: body.exclusion.userId,
          reason: body.exclusion.reason,
        }),
      )
      .build();
  }

  @Delete('leaderboards/exclusions/:exclusionId')
  @RequiresPermission('leaderboard.moderate')
  @ApiOperation({
    summary: 'Bỏ một lượt loại',
    description: 'Có ghi audit. Lượt đã bỏ thì 404.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    LeaderboardExclusionNotFoundException,
  )
  @ApiOkResponse({ type: ResponseDto.forApi(LeaderboardExclusionWrapperDto) })
  public async deleteExclusion(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: ExclusionIdParamDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.removeExclusion.handle({
          actorUserId: principal.userId,
          exclusionId: params.exclusionId,
        }),
      )
      .build();
  }

  @Get('badges')
  @RequiresPermission('leaderboard.read')
  @ApiOperation({
    summary: 'Huy hiệu đã trao',
    description:
      'Lọc theo tháng, bảng, người. Gồm cả huy hiệu đã hết hạn và đã gỡ.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException)
  @ApiOkResponse({ type: ResponseDto.forApi(ListAdminBadgesResponseDto) })
  public async getBadges(@Query() query: ListAdminBadgesQueryDto) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listBadges.handle({
          month: query.month,
          board: query.board,
          userId: query.userId,
          page: query.page,
          pageSize: query.pageSize,
        }),
      )
      .build();
  }

  @Patch('badges/:badgeId/revoke')
  @RequiresPermission('leaderboard.moderate')
  @ApiOperation({
    summary: 'Gỡ một huy hiệu',
    description:
      'Bắt buộc `reason`, có ghi audit. Bản chốt KHÔNG đổi: người xếp sau không được đôn lên. Huy hiệu đã gỡ thì 404.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    LeaderboardBadgeNotFoundException,
  )
  @ApiOkResponse({ type: ResponseDto.forApi(AdminBadgeWrapperDto) })
  public async patchRevoke(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: BadgeIdParamDto,
    @Body() body: RevokeBadgeBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.revokeBadge.handle({
          actorUserId: principal.userId,
          badgeId: params.badgeId,
          reason: body.revoke.reason,
        }),
      )
      .build();
  }
}
