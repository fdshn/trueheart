import {
  IDecideCharityContributionUseCase,
  IListMyContributionsUseCase,
  IUpdateCharityContributionUseCase,
} from '@/application/contracts/charity-campaign';
import {
  CharityContributionAlreadyDecidedException,
  CharityContributionNotEditableException,
  CharityContributionNotFoundException,
  CharityLinesInvalidException,
  CharityNeedExceededException,
  CharityNeedItemInvalidException,
  CharityNotAcceptingContributionsException,
  CharityNotOrganizerException,
} from '@/domain/exceptions';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import {
  Body,
  Controller,
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
  CharityContributionDto,
  CharityContributionPageDto,
  DecideCharityContributionBodyDto,
  DecideCharityContributionResponseDto,
  ListContributionsQueryDto,
  UpdateCharityContributionBodyDto,
} from '../../dto/charity-campaign/charity-campaign.dto';

/**
 * Đề nghị đóng góp nhìn từ phía NGƯỜI TẶNG (F65b §4).
 *
 * File riêng, cùng lý do như `charity-campaign-public.controller.ts`: `route-order-guard`
 * quét theo FILE, nên trộn một prefix khác vào cùng file sẽ làm nó so thứ tự giữa hai
 * nhóm route không đụng gì nhau.
 *
 * Đường của người TỔ CHỨC nằm ở `charity-campaign.controller.ts` dưới
 * `/charity-campaigns/:id/contributions` — hai vai đọc hai danh sách khác nhau, và
 * tách theo prefix làm chuyện đó đọc được từ URL.
 */
@ApiTags('Hoạt động Từ thiện')
@Controller('charity-contributions')
export class CharityContributionController {
  public constructor(
    @Inject(IListMyContributionsUseCase)
    private readonly listMineUseCase: IListMyContributionsUseCase,
    @Inject(IUpdateCharityContributionUseCase)
    private readonly updateUseCase: IUpdateCharityContributionUseCase,
    @Inject(IDecideCharityContributionUseCase)
    private readonly decideUseCase: IDecideCharityContributionUseCase,
  ) {}

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đề nghị đóng góp của chính tôi',
    description:
      'Mọi hoạt động, mới nhất trước. Mỗi dòng mang `acceptedQuantity`: `null` là người tổ chức chưa xét, `0` là đã xét và không nhận.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityContributionPageDto) })
  @ApiErrorResponses(...ApiTokenErrors)
  public async listMine(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListContributionsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listMineUseCase.handle({
          contributorId: principal.userId,
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
        }),
      )
      .build();
  }

  @Post(':id/decision')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Người tổ chức quyết mọi dòng của một đề nghị (F65b §5)',
    description:
      'Chấp nhận toàn bộ, một phần, hoặc từ chối từng dòng — trong MỘT lượt, nguyên tử. Phần được nhận sinh MỘT lượt giao nhận; từ chối hết thì không sinh lượt nào.\n\n' +
      '**Chống vượt nhu cầu.** Phần còn thiếu được tính lại SAU khi đã khoá các dòng nhu cầu, nên hai lượt quyết cùng lúc vào một nhu cầu thì lượt sau thấy con số lượt trước để lại. Vượt thì `409 CHARITY_NEED_EXCEEDED` kèm phần còn lại MỚI NHẤT — không âm thầm cắt số, vì người tổ chức phải biết chính xác mình vừa chấp nhận bao nhiêu.\n\n' +
      '**Chống trùng.** `decisionKey` cùng giá trị thì nhận lại đúng kết quả cũ với `replayed: true`. Khoá khác trên một đề nghị đã quyết thì `409 CHARITY_CONTRIBUTION_ALREADY_DECIDED`.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(DecideCharityContributionResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityContributionNotFoundException,
    CharityNotOrganizerException,
    CharityContributionAlreadyDecidedException,
    CharityNotAcceptingContributionsException,
    CharityLinesInvalidException,
    [CharityNeedExceededException, ['Gạo tẻ', 60, 40]],
  )
  public async decide(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('id') id: string,
    @Body() body: DecideCharityContributionBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.decideUseCase.handle({
          contributionId: id,
          organizerId: principal.userId,
          decisionKey: body.decisionKey,
          decisions: body.decisions,
        }),
      )
      .build();
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Sửa hoặc rút đề nghị đóng góp',
    description:
      'Chỉ khi **chưa có phần nào được chấp nhận** (F65b §4). Sau đó mọi thay đổi phải đi qua huỷ lượt giao nhận — sửa ngược một đề nghị đã sinh lượt giao nhận là để hai bên nói khác nhau về cùng một cam kết.\n\n' +
      '`action = REPLACE` thay **trọn bộ** dòng: bỏ một dòng khỏi mảng là xoá dòng đó. Vá từng dòng thì việc BỎ một dòng không diễn đạt được.\n\n' +
      '`action = WITHDRAW` đổi trạng thái sang `WITHDRAWN`, **không xoá** bản ghi: người tổ chức đã đọc đề nghị đó và cần biết nó từng tồn tại.\n\n' +
      'Đề nghị của người khác trả cùng lỗi với đề nghị không tồn tại.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityContributionDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityContributionNotFoundException,
    CharityContributionNotEditableException,
    CharityNeedItemInvalidException,
  )
  public async update(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('id') id: string,
    @Body() body: UpdateCharityContributionBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.updateUseCase.handle({
          contributionId: id,
          contributorId: principal.userId,
          action: body.action,
          note: body.note,
          contactNote: body.contactNote,
          items: body.items,
        }),
      )
      .build();
  }
}
