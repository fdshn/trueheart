import {
  IGetTrustThresholdsUseCase,
  ISetTrustThresholdUseCase,
} from '@/application/contracts/admin-config';
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
import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  SetGiverAccuracyThresholdBodyDto,
  SetReportAbuseThresholdBodyDto,
  SetReviewRatingThresholdBodyDto,
  TrustThresholdsResponseDto,
} from '../../dto/admin-config/trust-threshold.dto';
import { RequiresPermission } from '../../guards';

const WriteDescription =
  'Ghi copy-on-write như mọi system config: bản cũ đóng lại, `reason` đi thẳng vào audit log. ' +
  'Giá trị ngoài khoảng bị 400 chứ không lặng lẽ kẹp — Admin phải thấy con số mình gõ có được nhận không. ' +
  'Response trả lại cả ba ngưỡng sau khi ghi.';

@ApiTags('Admin - Ngưỡng tin cậy')
@ApiBearerAuth()
@Controller('admin/config/trust-thresholds')
export class AdminTrustThresholdController {
  public constructor(
    @Inject(IGetTrustThresholdsUseCase)
    private readonly getUseCase: IGetTrustThresholdsUseCase,
    @Inject(ISetTrustThresholdUseCase)
    private readonly setUseCase: ISetTrustThresholdUseCase,
  ) {}

  @Get()
  @RequiresPermission('config.read')
  @ApiOperation({
    summary: 'Ba ngưỡng tin cậy: mô tả đúng, điểm sao, báo xấu ác ý',
    description:
      'Ba khoá JSON `accuracy.giver`, `rating.display`, `report.abuse`. Endpoint chung `POST /admin/system-configs` chỉ nhận số nguyên, nên trước đây chúng chỉ đổi được bằng SQL tay.\n\n' +
      '`value` là thứ hệ thống ĐANG CHẠY — đã chuẩn hoá bằng đúng hàm mà nơi đọc ngưỡng dùng; khoá chưa publish thì là mặc định và `isConfigured: false`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(TrustThresholdsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async get(@CurrentUser() principal: IAuthPrincipal) {
    return ResponseDto.create()
      .succeed()
      .attach(await this.getUseCase.handle({ actorUserId: principal.userId }))
      .build();
  }

  @Put('giver-accuracy')
  @RequiresPermission('config.write')
  @ApiOperation({
    summary: 'Publish ngưỡng chỉ số mô tả đúng (`accuracy.giver`)',
    description: WriteDescription,
  })
  @ApiOkResponse({ type: ResponseDto.forApi(TrustThresholdsResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [
      ValidationFailedException,
      ['giverAccuracy.minSamples must not be greater than 100'],
    ],
  )
  public async setGiverAccuracy(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: SetGiverAccuracyThresholdBodyDto,
  ) {
    const { reason, ...value } = body.giverAccuracy;
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.setUseCase.handle({
          actorUserId: principal.userId,
          section: 'giverAccuracy',
          value,
          reason,
        }),
      )
      .build();
  }

  @Put('review-rating')
  @RequiresPermission('config.write')
  @ApiOperation({
    summary: 'Publish ngưỡng công bố điểm sao (`rating.display`)',
    description: WriteDescription,
  })
  @ApiOkResponse({ type: ResponseDto.forApi(TrustThresholdsResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [
      ValidationFailedException,
      ['reviewRating.minSamples must not be less than 1'],
    ],
  )
  public async setReviewRating(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: SetReviewRatingThresholdBodyDto,
  ) {
    const { reason, ...value } = body.reviewRating;
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.setUseCase.handle({
          actorUserId: principal.userId,
          section: 'reviewRating',
          value,
          reason,
        }),
      )
      .build();
  }

  @Put('report-abuse')
  @RequiresPermission('config.write')
  @ApiOperation({
    summary: 'Publish ngưỡng nhận diện báo xấu ác ý (`report.abuse`)',
    description: WriteDescription,
  })
  @ApiOkResponse({ type: ResponseDto.forApi(TrustThresholdsResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [
      ValidationFailedException,
      ['reportAbuse.dismissedRatioPercent must not be greater than 100'],
    ],
  )
  public async setReportAbuse(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: SetReportAbuseThresholdBodyDto,
  ) {
    const { reason, ...value } = body.reportAbuse;
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.setUseCase.handle({
          actorUserId: principal.userId,
          section: 'reportAbuse',
          value,
          reason,
        }),
      )
      .build();
  }
}
