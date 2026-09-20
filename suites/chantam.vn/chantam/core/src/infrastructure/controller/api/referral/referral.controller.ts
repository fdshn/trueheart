import { IGetOwnReferralUseCase } from '@/application/contracts/referral';
import { IGetOwnReferralResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { Controller, Get, Inject } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GetOwnReferralResponseDto } from '../../dto/referral';

@ApiTags('Giới thiệu')
@ApiBearerAuth()
@Controller('referrals')
export class ReferralController {
  public constructor(
    @Inject(IGetOwnReferralUseCase)
    private readonly getOwnReferralUseCase: IGetOwnReferralUseCase,
  ) {}

  @Get('me')
  @ApiOperation({
    summary: 'Mã và thống kê giới thiệu của chính chủ',
    description:
      'Ba con số khác nhau có chủ đích: `totalCount` là số người đã đăng ký bằng mã, `qualifiedCount` là số người trong đó đã lên Thành viên (mới tính là đủ điều kiện), `rewardedCount` là số lượt thật sự được thưởng sau khi áp trần theo ngày. Mã giới thiệu là BẤT BIẾN, gắn lúc đăng ký — không có endpoint gắn sau hay chuyển nhượng, vì cả hai đều là đường farm thưởng.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetOwnReferralResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors)
  public async getOwnReferral(
    @CurrentUser() principal: IAuthPrincipal,
  ): Promise<ResponseDto<IGetOwnReferralResponseDto>> {
    const result = await this.getOwnReferralUseCase.handle({
      userId: principal.userId,
    });

    return ResponseDto.create<IGetOwnReferralResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }
}
