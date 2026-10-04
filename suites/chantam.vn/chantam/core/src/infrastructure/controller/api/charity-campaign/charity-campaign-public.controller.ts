import {
  IGetPublicCharityCampaignUseCase,
  IListPublicCharityCampaignsUseCase,
} from '@/application/contracts/charity-campaign';
import { CharityCampaignNotFoundException } from '@/domain/exceptions';
import { CharityCampaignPhase } from '@/domain/ports/repository';
import { Public } from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CharityCampaignDetailResponseDto,
  ListCharityCampaignsQueryDto,
  ListCharityCampaignsResponseDto,
} from '../../dto/charity-campaign/charity-campaign.dto';

/**
 * Đường CÔNG KHAI, theo đúng tên đặc tả nêu: `GET /campaigns`, `GET /campaigns/:slug`.
 *
 * `campaigns` chứ không `charity-campaigns` ở đây là chủ ý của đặc tả — link chia sẻ ra
 * ngoài ngắn hơn. Mọi đường CẦN token thì nằm dưới `charity-campaigns`, để không ai nhìn
 * một prefix mà đoán sai nó công khai hay không.
 *
 * ## Vì sao nằm ở FILE RIÊNG
 *
 * `route-order-guard` quét theo FILE, không theo class. Đặt controller này cùng file với
 * controller cần token thì `@Get(':idOrSlug')` ở đây bị tính là đứng trước `@Get('mine')`
 * và `@Get('joined')` ở class kia — guard báo ba lỗi, dù hai class có prefix khác nhau nên
 * thực tế không đụng gì.
 *
 * Sửa bằng cách đảo thứ tự class cũng làm guard xanh, nhưng đó là xanh nhờ may: một lượt
 * sắp xếp import hay một route mới thêm vào là nó đỏ lại. Tách file thì ranh giới file
 * trùng đúng ranh giới định tuyến thật, và lý lẽ theo-file của guard trở lại đúng.
 */
@ApiTags('Hoạt động Từ thiện')
@Controller('campaigns')
export class CharityCampaignPublicController {
  public constructor(
    @Inject(IListPublicCharityCampaignsUseCase)
    private readonly listUseCase: IListPublicCharityCampaignsUseCase,
    @Inject(IGetPublicCharityCampaignUseCase)
    private readonly getUseCase: IGetPublicCharityCampaignUseCase,
  ) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Danh sách hoạt động từ thiện đã duyệt',
    description:
      'Công khai, không cần token. Chỉ hoạt động `APPROVED`, còn bật và chưa xoá — hồ ' +
      'sơ chờ duyệt không lọt ra đường này.\n\n' +
      'KHÔNG lọc theo bán kính hạng (UI-CHARITY-01): hoạt động từ thiện là thứ ai cũng ' +
      'nên thấy, khác bài Tặng/Nhận. Vị trí vẫn trả về để hiện trên Map Discovery.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(ListCharityCampaignsResponseDto),
  })
  public async list(@Query() query: ListCharityCampaignsQueryDto) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listUseCase.handle({
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
          phase: query.phase as CharityCampaignPhase | undefined,
        }),
      )
      .build();
  }

  @Get(':idOrSlug')
  @Public()
  @ApiOperation({
    summary: 'Một hoạt động, theo slug hoặc id',
    description:
      'Nhận cả hai dạng: slug có dạng `[a-z0-9]+(-[a-z0-9]+)*` khớp trọn chuỗi nên không chuỗi nào ' +
      'vừa là UUID hợp lệ vừa là slug hợp lệ, và một câu truy vấn phục vụ được cả hai.\n\n' +
      'Tra bằng id cũng CHỈ trả hoạt động đã duyệt: đường này công khai, nên một hồ sơ ' +
      'chờ duyệt đọc được bằng id là nội dung chưa kiểm lọt ra ngoài. Người gửi hồ sơ xem ' +
      'hồ sơ của mình ở `GET /charity-campaigns/mine`.\n\n' +
      '`isJoined` trả `null` ở đây — đường công khai không biết người gọi là ai.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityCampaignDetailResponseDto),
  })
  @ApiErrorResponses([CharityCampaignNotFoundException])
  public async getOne(@Param('idOrSlug') idOrSlug: string) {
    return ResponseDto.create()
      .succeed()
      .attach(await this.getUseCase.handle({ idOrSlug }))
      .build();
  }
}
