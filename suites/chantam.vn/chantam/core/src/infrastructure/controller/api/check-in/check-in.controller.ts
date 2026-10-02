import {
  IGetCheckInHistoryUseCase,
  IGetCheckInStateUseCase,
  IRecordCheckInUseCase,
  IRepairCheckInUseCase,
} from '@/application/contracts/check-in';
import {
  CheckInPolicyUnavailableException,
  CheckInRepairCreditInsufficientException,
  CheckInRepairDateInvalidException,
  CheckInRepairUnavailableException,
} from '@/domain/exceptions';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  GetCheckInHistoryQueryDto,
  GetCheckInHistoryResponseDto,
  GetCheckInStateResponseDto,
  RecordCheckInResponseDto,
  RepairCheckInBodyDto,
} from '../../dto/check-in';

@ApiTags('Điểm danh và chuỗi ngày')
@ApiBearerAuth()
@Controller('check-ins')
export class CheckInController {
  public constructor(
    @Inject(IGetCheckInStateUseCase)
    private readonly getStateUseCase: IGetCheckInStateUseCase,
    @Inject(IGetCheckInHistoryUseCase)
    private readonly getHistoryUseCase: IGetCheckInHistoryUseCase,
    @Inject(IRecordCheckInUseCase)
    private readonly recordUseCase: IRecordCheckInUseCase,
    @Inject(IRepairCheckInUseCase)
    private readonly repairUseCase: IRepairCheckInUseCase,
  ) {}

  // `me` và `me/history` đều TĨNH nên không đụng route tham số nào, nhưng giữ
  // chúng trước mọi route động trong file này là quy ước của repo —
  // `route-order-guard.spec.ts` canh.
  @Get('me')
  @ApiOperation({
    summary: 'Trạng thái điểm danh của chính mình',
    description:
      'Đọc được KỂ CẢ khi tính năng đang tắt (`enabled: false`): lịch sử là dữ ' +
      'liệu của người dùng, và khoá đường đọc khi Admin tắt sẽ làm họ tưởng mất hết.\n\n' +
      'Ba con số chuỗi nói ba chuyện khác nhau: `currentStreak` là đoạn liên tiếp ' +
      'đang giữ, `recoverableStreak` là chiều dài sẽ có nếu bù hết, và ' +
      '`pendingGapDates` là những ngày còn thiếu. Dùng `repairableDates` để hiện ' +
      'nút bù — nó đã lọc theo cửa sổ và theo số lượt còn lại.\n\n' +
      '`businessDate` là ngày theo giờ Việt Nam do server tính. App đừng tự suy ' +
      'từ giờ thiết bị: một người để lệch múi giờ sẽ thấy lịch lệch một ngày.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetCheckInStateResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors)
  public async getState(@CurrentUser() principal: IAuthPrincipal) {
    return ResponseDto.create()
      .succeed()
      .attach(await this.getStateUseCase.handle({ userId: principal.userId }))
      .build();
  }

  @Get('me/history')
  @ApiOperation({
    summary: 'Lịch điểm danh của chính mình, phân trang',
    description:
      'Chỉ dữ liệu của người gọi — id lấy từ token, không nhận từ query.\n\n' +
      '`milestoneAwarded` trỏ mốc đã mở nhờ ĐÚNG ngày đó, nối qua `entry_id` chứ ' +
      'không suy từ `streakDay`: entry chỉ ghi thêm nên `streakDay` của ngày cũ ' +
      'giữ giá trị lúc chèn, trong khi chiều dài chuỗi thì đã nhảy lên sau một lần bù.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetCheckInHistoryResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors)
  public async getHistory(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: GetCheckInHistoryQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getHistoryUseCase.handle({
          userId: principal.userId,
          page: query.page,
          pageSize: query.pageSize,
        }),
      )
      .build();
  }

  @Post()
  @ApiOperation({
    summary: 'Điểm danh hôm nay',
    description:
      'Ngày lấy từ giờ server theo múi Việt Nam, KHÔNG nhận từ client: nhận ngày ' +
      'từ client là mời người ta điểm danh cho ngày mai, hoặc lấp ngược quá khứ ' +
      'miễn phí mà không tiêu lượt bù nào.\n\n' +
      'Gọi lại trong cùng ngày KHÔNG phải lỗi — một lần bấm đôi thôi. Lượt sau trả ' +
      '`applied: false` kèm đúng chuỗi hiện tại và `dailyPointsAwarded: 0`, không ' +
      'cộng điểm lần hai.\n\n' +
      'Đạt mốc thì `milestonePointsAwarded` cộng THÊM điểm ngày. Một lần điểm danh ' +
      'có thể mở nhiều mốc cùng lúc nếu chuỗi vừa nhảy qua chúng.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(RecordCheckInResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [CheckInPolicyUnavailableException])
  public async record(@CurrentUser() principal: IAuthPrincipal) {
    return ResponseDto.create()
      .succeed()
      .attach(await this.recordUseCase.handle({ userId: principal.userId }))
      .build();
  }

  @Post('repairs')
  @ApiOperation({
    summary: 'Bù một ngày đã bỏ lỡ để nối lại chuỗi',
    description:
      'Tiêu MỘT lượt bù. Ngày bù KHÔNG nhận điểm cơ bản của ngày đã bỏ lỡ, nhưng ' +
      'có thể nối lại chuỗi và mở thưởng mốc chưa từng nhận trong chuỗi đó.\n\n' +
      'Chỉ bù được một ngày đang nằm trong `pendingGapDates` của chuỗi đang mở và ' +
      'còn trong cửa sổ `repairWindowDays`. Một ngày ngoài khoảng chuỗi thì bù vào ' +
      'cũng không nối lại gì, nên bị từ chối thay vì tiêu lượt vô ích.\n\n' +
      'Lượt bù chỉ tích từ giao dịch tặng/nhận quà **hoàn tất**, và cả người tặng ' +
      'lẫn người nhận đều được tính.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(RecordCheckInResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [CheckInPolicyUnavailableException],
    [CheckInRepairDateInvalidException, 7],
    [CheckInRepairCreditInsufficientException, 4],
    [CheckInRepairUnavailableException],
  )
  public async repair(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: RepairCheckInBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.repairUseCase.handle({
          userId: principal.userId,
          date: body.repair.date,
        }),
      )
      .build();
  }
}
