import { IAdjustUserPointsUseCase } from '@/application/contracts/point';
import { UserNotFoundException } from '@/domain/exceptions';
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
import { Body, Controller, Inject, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AdjustUserPointsBodyDto,
  AdjustUserPointsResponseDto,
} from '../../dto/point';
import { RequiresPermission } from '../../guards';

/**
 * Tách khỏi `AdminPointLedgerController` vì khác gốc đường dẫn:
 * `admin/points/ledger/...` ở đó, `admin/points/adjust` ở đây (SRS §7.2.4).
 * Nhét vào controller kia thì gốc phải hạ xuống `admin/points` rồi mọi route cũ
 * mang thêm tiền tố `ledger/` — đổi một đường dẫn đang chạy để khỏi tạo một file
 * là cái giá sai.
 */
@ApiTags('Admin - Sổ điểm')
@ApiBearerAuth()
@Controller('admin/points')
export class AdminPointAdjustController {
  public constructor(
    @Inject(IAdjustUserPointsUseCase)
    private readonly adjustUserPointsUseCase: IAdjustUserPointsUseCase,
  ) {}

  @Post('adjust')
  @RequiresPermission('point.adjust')
  @ApiOperation({
    summary: 'Cộng/trừ điểm cho một người, kèm lý do',
    description:
      'Ghi THÊM một bút toán vào `point_ledger`, không sửa dòng nào: bảng đó ' +
      'chỉ ghi thêm và có trigger chặn `UPDATE`.\n\n' +
      'Khác `POST /admin/points/ledger/{entryId}/reversal` ở chỗ không cần một ' +
      'bút toán có trước. Dùng đường này để bù đắp một việc xảy ra NGOÀI hệ ' +
      'thống; dùng đường reversal khi muốn phủ nhận một khoản đã ghi — nó trừ ' +
      'cả `lifetime`, còn đường này thì không.\n\n' +
      'Khoản trừ có thể đẩy `rawBalance` xuống âm. Đó là cố ý: `balance` vẫn ' +
      'kẹp ở 0 nên người dùng không tiêu được, và khoản hụt tự khấu vào những ' +
      'lần được cộng sau.\n\n' +
      'Mọi lần ghi đều vào `admin_audit_logs` kèm số dư sau đó, và hạng được ' +
      'tính lại ngay.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(AdjustUserPointsResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [
      ValidationFailedException,
      ['delta: trị tuyệt đối không được vượt 100000'],
    ],
    UserNotFoundException,
  )
  public async adjustUserPoints(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: AdjustUserPointsBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.adjustUserPointsUseCase.handle({
          actorUserId: principal.userId,
          userId: body.userId,
          delta: body.delta,
          reason: body.reason,
          idempotencyKey: body.idempotencyKey,
        }),
      )
      .build();
  }
}
