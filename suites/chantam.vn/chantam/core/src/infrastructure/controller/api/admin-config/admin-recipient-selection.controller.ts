import {
  IGetAdminRecipientSelectionUseCase,
  IListAdminRecipientSelectionsUseCase,
} from '@/application/contracts/recipient-selection';
import { GiftTransactionNotFoundException } from '@/domain/exceptions';
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
import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AdminRecipientSelectionParamsDto,
  GetAdminRecipientSelectionResponseDto,
  ListAdminRecipientSelectionsQueryDto,
  ListAdminRecipientSelectionsResponseDto,
} from '../../dto/admin-config/recipient-selection.dto';
import { RequiresPermission } from '../../guards';

/**
 * Lý do hệ thống tự chọn người nhận (PR #46 §9) — chỉ đọc. Ghi duy nhất trong transaction của
 * lượt trao do job tạo, nên không có đường sửa hay xoá.
 */
@ApiTags('Quản trị — lượt trao')
@ApiBearerAuth()
@Controller('admin/recipient-selections')
export class AdminRecipientSelectionController {
  public constructor(
    @Inject(IListAdminRecipientSelectionsUseCase)
    private readonly listUseCase: IListAdminRecipientSelectionsUseCase,
    @Inject(IGetAdminRecipientSelectionUseCase)
    private readonly getUseCase: IGetAdminRecipientSelectionUseCase,
  ) {}

  @Get()
  @RequiresPermission('post.read')
  @ApiOperation({
    summary: 'Danh sách lượt trao do hệ thống tự chọn người nhận',
    description:
      'Mỗi dòng: bài, người được chọn, tiêu chí quyết định kèm câu giải thích, số ứng viên, trạng thái hiện tại của lượt trao. ' +
      'Lọc theo bài, người (người được chọn HOẶC chủ bài), tiêu chí, khoảng thời gian chọn `[from, to)`. Mới nhất trước. ' +
      'Lượt chủ bài tự chọn không có ở đây. Cùng quyền với `GET /admin/transactions` (`post.read`).',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(ListAdminRecipientSelectionsResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [ValidationFailedException, ['from: phải trước to']],
  )
  public async list(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListAdminRecipientSelectionsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listUseCase.handle({
          actorUserId: principal.userId,
          postId: query.postId,
          userId: query.userId,
          decidingCriterion: query.decidingCriterion,
          from: query.from,
          to: query.to,
          page: query.page,
          pageSize: query.pageSize,
        }),
      )
      .build();
  }

  @Get(':transactionId')
  @RequiresPermission('post.read')
  @ApiOperation({
    summary: 'Vì sao hệ thống chọn người này cho một lượt trao',
    description:
      'Thứ tự tiêu chí ĐÃ dùng lúc chọn và số đo của người được chọn, người về nhì TẠI LÚC chọn (số đo hiện tại có thể đã khác). ' +
      '`selection: null` khi lượt trao có thật nhưng do chủ bài tự chọn; lượt trao không tồn tại thì 404.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(GetAdminRecipientSelectionResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [ValidationFailedException, ['transactionId must be a UUID']],
    [GiftTransactionNotFoundException],
  )
  public async getOne(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: AdminRecipientSelectionParamsDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getUseCase.handle({
          actorUserId: principal.userId,
          transactionId: params.transactionId,
        }),
      )
      .build();
  }
}
