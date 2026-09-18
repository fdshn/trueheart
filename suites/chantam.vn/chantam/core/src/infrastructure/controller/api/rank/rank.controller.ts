import { IGetOwnRankSummaryUseCase } from '@/application/contracts/rank';
import { IGetOwnRankSummaryResponseDto } from '@chantam.vn/chantam.core-lib/dto';
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
import { GetOwnRankSummaryResponseDto } from '../../dto/rank';

@ApiTags('Thứ hạng')
@ApiBearerAuth()
@Controller('ranks')
export class RankController {
  public constructor(
    @Inject(IGetOwnRankSummaryUseCase)
    private readonly getOwnRankSummaryUseCase: IGetOwnRankSummaryUseCase,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Tóm tắt thứ hạng của chính chủ' })
  @ApiOkResponse({ type: ResponseDto.forApi(GetOwnRankSummaryResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors)
  public async getOwnRankSummary(
    @CurrentUser() principal: IAuthPrincipal,
  ): Promise<ResponseDto<IGetOwnRankSummaryResponseDto>> {
    const result = await this.getOwnRankSummaryUseCase.handle({
      userId: principal.userId,
    });

    return ResponseDto.create<IGetOwnRankSummaryResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }
}
