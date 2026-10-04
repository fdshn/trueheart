import {
  IGetMeritUnitUseCase,
  IListPublicMeritUnitsUseCase,
} from '@/application/contracts/merit';
import { MeritUnitNotFoundException } from '@/domain/exceptions';
import { Public } from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ListMeritUnitsQueryDto,
  ListMeritUnitsResponseDto,
  MeritUnitDetailResponseDto,
} from '../../dto/merit/merit.dto';

/**
 * Đường CÔNG KHAI của Công đức / Hồi hướng.
 *
 * File riêng, tách khỏi controller cần token — `route-order-guard` quét theo FILE, nên gộp
 * `:idOrSlug` với `declarations/mine` vào một file làm nó báo lỗi cho những route không hề
 * đụng nhau.
 */
@ApiTags('Công đức / Hồi hướng')
@Controller('merit-units')
export class MeritPublicController {
  public constructor(
    @Inject(IListPublicMeritUnitsUseCase)
    private readonly listUseCase: IListPublicMeritUnitsUseCase,
    @Inject(IGetMeritUnitUseCase)
    private readonly getUseCase: IGetMeritUnitUseCase,
  ) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Danh sách đơn vị nhận công đức',
    description:
      'Công khai, không cần token. Chỉ đơn vị còn bật và chưa xoá. Mỗi đơn vị kèm `vietQrUrl` ' +
      'dựng sẵn (chưa gắn số tiền) và `totalDeclaredAmount`.\n\n' +
      '`totalDeclaredAmount` là **tổng LỜI KHAI** của các lượt `COMPLETED`, không phải số ' +
      'tiền đơn vị đã nhận — hệ thống không đối chiếu với ngân hàng (UI-MERIT-01). Giao diện ' +
      'phải nói rõ điều đó.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListMeritUnitsResponseDto) })
  public async list(@Query() query: ListMeritUnitsQueryDto) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listUseCase.handle({
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
        }),
      )
      .build();
  }

  @Get(':idOrSlug')
  @Public()
  @ApiOperation({
    summary: 'Một đơn vị, theo slug hoặc id, kèm Sổ vàng',
    description:
      'Nhận cả hai dạng: slug có dạng `[a-z0-9]+(-[a-z0-9]+)*` khớp trọn chuỗi nên không chuỗi nào vừa là ' +
      'UUID hợp lệ vừa là slug hợp lệ.\n\n' +
      'Sổ vàng mặc định công khai (UI-MERIT-01). Hàng của người chọn ẩn danh hiện ' +
      '"Người ẩn danh" — tên thật **không ra khỏi tầng repository**, câu SQL không kéo nó về. ' +
      'Lọc ở tầng gần dữ liệu nhất là cách duy nhất để một endpoint thêm sau này không tự tạo ' +
      'một lối rò.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(MeritUnitDetailResponseDto) })
  @ApiErrorResponses([MeritUnitNotFoundException])
  public async getOne(@Param('idOrSlug') idOrSlug: string) {
    return ResponseDto.create()
      .succeed()
      .attach(await this.getUseCase.handle({ idOrSlug }))
      .build();
  }
}
