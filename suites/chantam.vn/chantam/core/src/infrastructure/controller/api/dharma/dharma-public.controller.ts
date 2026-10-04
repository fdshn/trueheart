import {
  IGetDharmaContentUseCase,
  IGetDharmaHubUseCase,
  IListPublicDharmaContentsUseCase,
} from '@/application/contracts/dharma';
import { DharmaContentNotFoundException } from '@/domain/exceptions';
import { DharmaContentType } from '@chantam.vn/chantam.core-lib/models';
import { Public } from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  DharmaContentDetailResponseDto,
  DharmaHubResponseDto,
  ListDharmaContentsQueryDto,
  ListDharmaContentsResponseDto,
} from '../../dto/dharma/dharma.dto';

/**
 * Đường CÔNG KHAI của Phật Pháp.
 *
 * File riêng, tách khỏi controller cần token — `route-order-guard` quét theo FILE, nên gộp
 * `contents/:idOrSlug` với `recitations/mine` vào một file làm nó báo lỗi cho những route
 * không hề đụng nhau.
 */
@ApiTags('Phật Pháp')
@Controller('dharma')
export class DharmaPublicController {
  public constructor(
    @Inject(IGetDharmaHubUseCase)
    private readonly hubUseCase: IGetDharmaHubUseCase,
    @Inject(IListPublicDharmaContentsUseCase)
    private readonly listUseCase: IListPublicDharmaContentsUseCase,
    @Inject(IGetDharmaContentUseCase)
    private readonly getUseCase: IGetDharmaContentUseCase,
  ) {}

  @Get('hub')
  @Public()
  @ApiOperation({
    summary: 'Dharma Hub — bảy entry của Layer 1',
    description:
      'UI-DHARMA-01: Phật Pháp là một Main Tab, và Layer 1 là Hub với các entry Kinh sách, ' +
      'Tụng kinh, Hồi hướng, Cúng/Công đức, Diễn đàn, Thông tin và Giới thiệu chùa.\n\n' +
      'Mỗi entry trả kèm `path` — đường API client gọi khi bấm. Trả từ server thay vì để ' +
      'client đóng cứng bảy đường, vì `MERIT` trỏ sang **`/merit-units`**, một phân hệ khác: ' +
      'UC-DHARMA-05 nói rõ *"tái sử dụng nghiệp vụ Công đức/Hồi hướng tại mục 3.3.11"*, nên ' +
      'Phật Pháp KHÔNG có bảng hay endpoint công đức riêng. Dựng bản thứ hai ở đây là hai ' +
      'nguồn cho cùng một số tài khoản ngân hàng.\n\n' +
      '`itemCount` là `null` với entry không đếm được từ `dharma_contents` — `0` ở đó đọc ra ' +
      '"không có gì", trong khi sự thật là con số phụ thuộc người đang xem.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(DharmaHubResponseDto) })
  public async hub() {
    return ResponseDto.create()
      .succeed()
      .attach(await this.hubUseCase.handle({}))
      .build();
  }

  @Get('contents')
  @Public()
  @ApiOperation({
    summary: 'Danh sách nội dung Phật Pháp đã xuất bản',
    description:
      'Một engine cho ba loại (BR-DHARMA-01) — lọc bằng `contentType`. Chỉ nội dung đã xuất ' +
      'bản và chưa xoá.\n\n' +
      '**KHÔNG trả `bodyText`.** Một bộ kinh tới 2 triệu ký tự, nên một trang 20 hàng mang cả ' +
      'nội dung là 40MB kéo về cho một màn hình chỉ hiện tiêu đề. Lấy nội dung ở đường chi tiết.\n\n' +
      '`category` được chuẩn hoá về slug trước khi lọc, nên "Kinh Đại Thừa" và "kinh dai thua" ' +
      'cùng ra một tập kết quả.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListDharmaContentsResponseDto) })
  public async list(@Query() query: ListDharmaContentsQueryDto) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listUseCase.handle({
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
          contentType: query.contentType as DharmaContentType | undefined,
          category: query.category,
          featuredOnly: query.featuredOnly ?? false,
        }),
      )
      .build();
  }

  @Get('contents/:idOrSlug')
  @Public()
  @ApiOperation({
    summary: 'Một nội dung, theo slug hoặc id',
    description:
      'Nhận cả hai dạng: slug có dạng `^[a-z0-9]+(-[a-z0-9]+)*$` nên không chuỗi nào vừa là ' +
      'UUID hợp lệ vừa là slug hợp lệ.\n\n' +
      'Tra bằng id cũng CHỈ trả bản đã xuất bản — đường này công khai, nên một bản nháp đọc ' +
      'được bằng id là nội dung chưa duyệt lọt ra ngoài.\n\n' +
      'Mỗi lượt gọi tăng `viewCount`. Lượt tăng đó KHÔNG đụng `updatedAt`, nếu không mọi bộ ' +
      'kinh đọc nhiều sẽ luôn hiện "vừa cập nhật" và Admin mất cách biết bản nào thật sự được sửa.\n\n' +
      '`isRecitable` là `true` chỉ với `SUTRA` (UC-DHARMA-02) — nó KHÔNG đòi có `audioUrl`, vì ' +
      'đặc tả nói audio chỉ hiện *"nếu Admin đã cấu hình"*, còn tụng theo bản chữ là đường chính.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(DharmaContentDetailResponseDto) })
  @ApiErrorResponses([DharmaContentNotFoundException])
  public async getOne(@Param('idOrSlug') idOrSlug: string) {
    return ResponseDto.create()
      .succeed()
      .attach(await this.getUseCase.handle({ idOrSlug }))
      .build();
  }
}
