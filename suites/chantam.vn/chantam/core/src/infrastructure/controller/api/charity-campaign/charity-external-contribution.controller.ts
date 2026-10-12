import { IAmendExternalContributionUseCase } from '@/application/contracts/charity-campaign';
import {
  CharityExternalContributionNotFoundException,
  CharityExternalContributionVoidedException,
  CharityLinesInvalidException,
} from '@/domain/exceptions';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { Body, Controller, Inject, Param, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AmendExternalContributionBodyDto,
  CharityExternalContributionDto,
} from '../../dto/charity-campaign/charity-campaign.dto';

/**
 * Sửa sai một bản ghi đóng góp ngoài app (F65b §7). File riêng vì prefix riêng — cùng
 * lý do `route-order-guard` như các controller từ thiện khác.
 */
@ApiTags('Hoạt động Từ thiện')
@Controller('charity-external-contributions')
export class CharityExternalContributionController {
  public constructor(
    @Inject(IAmendExternalContributionUseCase)
    private readonly amendUseCase: IAmendExternalContributionUseCase,
  ) {}

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Huỷ hoặc điều chỉnh một bản ghi ngoài app — luôn kèm lý do',
    description:
      'Không sửa tại chỗ: `VOID` đánh dấu huỷ, `ADJUST` huỷ bản này và trả về bản THAY THẾ mang số mới. Cả hai đều giữ bản cũ để đối soát, và một trigger ở database từ chối mọi đường sửa khác. Bản đã huỷ hay đã bị thay thì không thao tác tiếp — hãy thao tác trên bản đang có hiệu lực.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityExternalContributionDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityExternalContributionNotFoundException,
    CharityExternalContributionVoidedException,
    CharityLinesInvalidException,
  )
  public async amend(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('id') id: string,
    @Body() body: AmendExternalContributionBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.amendUseCase.handle({
          externalId: id,
          actorUserId: principal.userId,
          action: body.action,
          reason: body.reason,
          quantity: body.quantity,
        }),
      )
      .build();
  }
}
