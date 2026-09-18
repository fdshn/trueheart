import {
  IEvaluateDueRankMaintenanceUseCase,
  IGetOwnRankSummaryUseCase,
} from '@/application/contracts/rank';
import { IConfig } from '@/domain/ports/config';
import { IGetOwnRankSummaryResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Controller, Get, Inject, Post } from '@nestjs/common';
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
    @Inject(IEvaluateDueRankMaintenanceUseCase)
    private readonly evaluateDueRankMaintenanceUseCase: IEvaluateDueRankMaintenanceUseCase,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  @Post('maintenance/evaluate')
  @ApiOperation({
    summary: 'Đánh giá các chu kỳ duy trì rank đến hạn',
    description:
      'Chỉ username trong RANK_OPERATOR_USERNAMES. Trigger này phải do scheduler bên ngoài gọi; M3 chưa có completed-gift source nên activity unavailable được ghi UNEVALUATED, không bị giáng hạng.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(Object) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async evaluateDueRankMaintenance(
    @CurrentUser() principal: IAuthPrincipal,
  ): Promise<ResponseDto<{ processedCycles: number }>> {
    if (
      !this.config.rankOperator.usernames.includes(
        principal.username.toLowerCase(),
      )
    )
      throw new ForbiddenException();

    const result = await this.evaluateDueRankMaintenanceUseCase.handle({});
    return ResponseDto.create<{ processedCycles: number }>()
      .succeed()
      .attach(result)
      .build();
  }

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
