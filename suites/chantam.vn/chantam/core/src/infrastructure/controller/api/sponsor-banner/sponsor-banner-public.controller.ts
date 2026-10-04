import {
  IRecordBannerClickUseCase,
  IServeSponsorBannersUseCase,
} from '@/application/contracts/sponsor-banner';
import {
  SponsorBannerNotFoundException,
  SponsorBannerNotServingException,
} from '@/domain/exceptions';
import { BannerPlacement } from '@chantam.vn/chantam.core-lib/models';
import { Public } from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  BannerClickResponseDto,
  BannerIdParamDto,
  ServeBannersQueryDto,
  ServeBannersResponseDto,
} from '../../dto/sponsor-banner/sponsor-banner.dto';

/**
 * Đường CÔNG KHAI của banner tài trợ.
 *
 * Nằm ở file riêng, tách khỏi controller Admin — `route-order-guard` quét theo FILE, không
 * theo class, nên gộp hai thứ vào một file làm nó báo lỗi cho những route không hề đụng
 * nhau. Ranh giới file ở đây trùng đúng ranh giới định tuyến thật.
 *
 * UC-POST-04: Phase 1 **không có** endpoint nào cho người dùng tạo banner. Đó là chủ ý của
 * đặc tả chứ không phải phần còn thiếu.
 */
@ApiTags('Banner Tài Trợ')
@Controller('banners')
export class SponsorBannerPublicController {
  public constructor(
    @Inject(IServeSponsorBannersUseCase)
    private readonly serveUseCase: IServeSponsorBannersUseCase,
    @Inject(IRecordBannerClickUseCase)
    private readonly clickUseCase: IRecordBannerClickUseCase,
  ) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Banner đang chạy ở một vị trí',
    description:
      'Công khai, không cần token. Lọc đủ bốn điều kiện: đã duyệt, còn bật, chưa xoá, và ' +
      '**đang trong khung giờ** — thiếu điều kiện cuối là chạy banner của một hợp đồng đã ' +
      'hết, tức phát miễn phí cho đối tác cũ và chiếm chỗ của đối tác đang trả tiền.\n\n' +
      'Mỗi lượt gọi cộng một lượt hiển thị cho từng banner trả về. Đó là **lượt phục vụ**, ' +
      'không phải lượt mắt thấy: client prefetch hay người dùng cuộn qua mà không nhìn thì ' +
      'vẫn tính.\n\n' +
      'KHÔNG trả số liệu hiệu quả và liên hệ đối tác — đó là dữ liệu thương mại.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ServeBannersResponseDto) })
  public async serve(@Query() query: ServeBannersQueryDto) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.serveUseCase.handle({
          placement: query.placement as BannerPlacement,
          limit: query.limit ?? 5,
        }),
      )
      .build();
  }

  @Post(':id/click')
  @Public()
  @ApiOperation({
    summary: 'Ghi một lượt bấm và lấy đích để mở',
    description:
      'Chỉ đếm lượt bấm của banner ĐANG được phục vụ — một link cũ nằm trong ảnh chụp màn ' +
      'hình không cộng số cho một hợp đồng đã hết, và trả 409.\n\n' +
      'Trả `targetUrl` từ server thay vì để client dùng bản đã cache: Admin đổi link của ' +
      'một banner đang chạy thì lượt bấm tiếp theo đi đúng link mới.\n\n' +
      'Khác lượt hiển thị, lỗi ở đây **không** bị nuốt: một lượt bấm là con số đối soát ' +
      'trực tiếp với đối tác.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(BannerClickResponseDto) })
  @ApiErrorResponses(
    [SponsorBannerNotFoundException],
    SponsorBannerNotServingException,
  )
  public async click(@Param() param: BannerIdParamDto) {
    return ResponseDto.create()
      .succeed()
      .attach(await this.clickUseCase.handle({ bannerId: param.id }))
      .build();
  }
}
