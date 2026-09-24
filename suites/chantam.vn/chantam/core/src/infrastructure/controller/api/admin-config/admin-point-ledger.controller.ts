import { IReversePointEntryUseCase } from '@/application/contracts/point';
import { PointEntryNotReversibleException } from '@/domain/exceptions';
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
import { Body, Controller, Inject, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ReversePointEntryBodyDto,
  ReversePointEntryParamsDto,
  ReversePointEntryResponseDto,
} from '../../dto/point';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - Sổ điểm')
@ApiBearerAuth()
@Controller('admin/points/ledger')
export class AdminPointLedgerController {
  public constructor(
    @Inject(IReversePointEntryUseCase)
    private readonly reversePointEntryUseCase: IReversePointEntryUseCase,
  ) {}

  @Post(':entryId/reversal')
  @RequiresPermission('point.adjust')
  @ApiOperation({
    summary: 'Hoàn một bút toán điểm',
    description:
      'Ghi THÊM một bút toán ngược chứ KHÔNG sửa dòng cũ — sổ điểm chỉ ghi thêm, và lịch sử phải đọc ra được cả cái sai lẫn cái sửa. ' +
      'Lý do bắt buộc. Khoá chống trùng theo bút toán gốc nên hai Admin bấm cùng lúc chỉ hoàn một lần, và hoàn lần hai bị từ chối. ' +
      'Hoàn KHÁC phạt: nếu bút toán gốc có đẩy `lifetime` thì bút toán hoàn trừ lại, vì để nguyên là sàn hạng bị thổi lên vĩnh viễn bởi một lỗi nhập liệu. Hạng được tính lại ngay sau đó. ' +
      'Cần quyền `point.adjust`, tách khỏi `config.write`: sửa một rule và đảo một bút toán trên tài khoản cụ thể là hai việc khác nhau.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(ReversePointEntryResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [ValidationFailedException, ['reversal.reason: phải nêu lý do hoàn']],
    PointEntryNotReversibleException,
  )
  public async reverseEntry(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: ReversePointEntryParamsDto,
    @Body() body: ReversePointEntryBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.reversePointEntryUseCase.handle({
          actorUserId: principal.userId,
          entryId: params.entryId,
          reversal: body.reversal,
        }),
      )
      .build();
  }
}
