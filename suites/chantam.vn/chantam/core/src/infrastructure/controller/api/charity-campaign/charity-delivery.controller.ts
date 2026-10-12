import {
  ICancelCharityDeliveryUseCase,
  ICompleteCharityDeliveryUseCase,
  IGetCharityDeliveryUseCase,
} from '@/application/contracts/charity-campaign';
import {
  CharityDeliveryInvalidStateException,
  CharityDeliveryNotFoundException,
  CharityLinesInvalidException,
  CharityNotOrganizerException,
} from '@/domain/exceptions';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CancelCharityDeliveryBodyDto,
  CharityDeliveryDto,
  CompleteCharityDeliveryBodyDto,
} from '../../dto/charity-campaign/charity-campaign.dto';

/**
 * Lượt giao nhận từ thiện (F65b §6).
 *
 * Bảng RIÊNG, không phải `gift_transactions` — xem docblock migration
 * `1800000000000-CreateCharityDeliveries`. Hệ quả cho client: lượt giao nhận từ thiện
 * KHÔNG xuất hiện ở `/transactions/*`, không có phòng chat, ảnh bàn giao, cron tự hoàn
 * tất hay review của lượt trao.
 */
@ApiTags('Hoạt động Từ thiện')
@Controller('charity-deliveries')
export class CharityDeliveryController {
  public constructor(
    @Inject(IGetCharityDeliveryUseCase)
    private readonly getUseCase: IGetCharityDeliveryUseCase,
    @Inject(ICompleteCharityDeliveryUseCase)
    private readonly completeUseCase: ICompleteCharityDeliveryUseCase,
    @Inject(ICancelCharityDeliveryUseCase)
    private readonly cancelUseCase: ICancelCharityDeliveryUseCase,
  ) {}

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Một lượt giao nhận từ thiện',
    description:
      'Chỉ hai bên — người tặng và người tổ chức — đọc được. Người ngoài nhận cùng lỗi với lượt không tồn tại.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityDeliveryDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityDeliveryNotFoundException)
  public async getOne(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('id') id: string,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getUseCase.handle({
          deliveryId: id,
          viewerUserId: principal.userId,
        }),
      )
      .build();
  }

  @Post(':id/complete')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Người tổ chức xác nhận đã nhận, kèm số thực nhận từng dòng',
    description:
      'Số thực nhận có thể nhỏ hơn số đã chấp nhận; phần thiếu trở về nhu cầu để người khác tặng tiếp. Tiến độ công khai chỉ tăng theo số THỰC NHẬN.\n\n' +
      'Hoàn tất xong thì người tặng được cộng điểm `CHARITY_CONTRIBUTION_COMPLETED` **một lần cho mỗi đề nghị** — nếu thực nhận được ít nhất một thứ. Point Rule đó đang **TẮT** chờ Bên A chốt mức, nên hiện chưa phát điểm; lượt hoàn tất vẫn thành công.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityDeliveryDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityDeliveryNotFoundException,
    CharityNotOrganizerException,
    CharityDeliveryInvalidStateException,
    CharityLinesInvalidException,
  )
  public async complete(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('id') id: string,
    @Body() body: CompleteCharityDeliveryBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.completeUseCase.handle({
          deliveryId: id,
          organizerId: principal.userId,
          received: body.received,
        }),
      )
      .build();
  }

  @Post(':id/cancel')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Huỷ lượt giao nhận (người tặng hoặc người tổ chức)',
    description:
      'Trả phần đã chấp nhận về nhu cầu. KHÔNG xoá đề nghị hay lịch sử: đề nghị giữ nguyên trạng thái đã được chấp nhận, vì nó là bản ghi của một cam kết đã có thật. Chỉ huỷ được khi lượt giao còn `ACCEPTED`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityDeliveryDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityDeliveryNotFoundException,
    CharityDeliveryInvalidStateException,
    CharityLinesInvalidException,
  )
  public async cancel(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('id') id: string,
    @Body() body: CancelCharityDeliveryBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.cancelUseCase.handle({
          deliveryId: id,
          actorUserId: principal.userId,
          reason: body.reason,
        }),
      )
      .build();
  }
}
