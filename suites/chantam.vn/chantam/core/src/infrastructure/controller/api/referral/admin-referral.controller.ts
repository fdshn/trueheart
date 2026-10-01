import { IListReferralReviewUseCase } from '@/application/contracts/referral';
import { ApiTokenErrors } from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ListReferralReviewQueryDto,
  ListReferralReviewResponseDto,
} from '../../dto/referral/admin-referral.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - Giới thiệu')
@ApiBearerAuth()
@Controller('admin/referrals')
export class AdminReferralController {
  public constructor(
    @Inject(IListReferralReviewUseCase)
    private readonly listReferralReviewUseCase: IListReferralReviewUseCase,
  ) {}

  @Get('review')
  // Dùng lại `report.read` chứ không thêm quyền mới: đây là cùng một việc với hàng
  // đợi báo xấu — đọc hồ sơ bị gắn cờ để quyết định. Thêm quyền thứ hai cho cùng
  // một vai là tạo ra một ô nữa trong bảng phân quyền mà không ai biết khác gì ô cũ.
  @RequiresPermission('report.read')
  @ApiOperation({
    summary:
      'Ai đang có dấu hiệu tự tạo nhiều tài khoản để nhận thưởng giới thiệu',
    description:
      'Người giới thiệu có nhiều người được mời TRÙNG dấu vết đăng ký, xếp nặng trước. Ngưỡng ở cấu hình động `referral.abuse`.\n\n' +
      '**Mặc định TẮT**, và đó là chủ ý: hai cột dấu vết chỉ bắt đầu được ghi từ 30/09 nên chưa ai biết "bình thường" trông thế nào, mà một ngưỡng chọn trước khi có dữ liệu là phỏng đoán mặc áo chính sách — nó sẽ sai theo hướng hoặc không bao giờ nổ, hoặc nổ với mọi người. Đọc `threshold.enabled` để phân biệt "danh sách rỗng vì chưa bật" với "rỗng vì không có ai".\n\n' +
      'Lọc theo cụm THIẾT BỊ và cụm lớn nhất, **không** theo cụm IP: mạng di động Việt Nam dùng CGNAT nên hàng nghìn người không liên quan chia một IPv4, cộng thêm wifi gia đình, quán cà phê, tiệm net — ngưỡng theo IP sẽ nổ với người dùng thật nhiều hơn với kẻ gian. Số cụm IP vẫn trả ra để Admin đọc.\n\n' +
      '**KHÔNG tự động phạt** — y như `GET /admin/reports/reporters` và cờ Giver Accuracy. Khi xác minh là tài khoản ảo thì thu hồi điểm bằng `POST /admin/points/ledger/:entryId/reversal`; lấy `entryId` ở `GET /admin/users/:userId` (`referrals.invitees[].rewardEntryId`).\n\n' +
      'Tính SỐNG từ `referrals`, không lưu thành cờ: đổi ngưỡng có hiệu lực ngay, và con số không bao giờ lệch được với nguồn. Một cờ lưu sẵn cho điều kiện này còn cũ theo hai chiều — hạ ngưỡng thì cờ cũ thiếu người, gỡ khoá một người được mời thì cờ cũ chỉ sai người.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListReferralReviewResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async listReferralReview(@Query() query: ListReferralReviewQueryDto) {
    return ResponseDto.create()
      .succeed()
      .attach(await this.listReferralReviewUseCase.handle({ ...query }))
      .build();
  }
}
