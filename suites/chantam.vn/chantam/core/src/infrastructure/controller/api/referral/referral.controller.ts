import { IGetOwnReferralUseCase } from '@/application/contracts/referral';
import { IGetOwnReferralResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { CurrentUser, IAuthPrincipal } from '@chantam/service.auth-lib';
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
  @ApiOperation({ summary: 'Mã và thống kê giới thiệu của chính chủ' })
  @ApiOkResponse({ type: ResponseDto.forApi(GetOwnReferralResponseDto) })
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
