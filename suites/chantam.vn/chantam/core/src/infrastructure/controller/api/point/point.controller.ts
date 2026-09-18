import {
  IGetOwnPointLedgerUseCase,
  IGetOwnPointSummaryUseCase,
} from '@/application/contracts/point';
import {
  IGetOwnPointLedgerResponseDto,
  IGetOwnPointSummaryResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { CurrentUser, IAuthPrincipal } from '@chantam/service.auth-lib';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  GetOwnPointLedgerQueryDto,
  GetOwnPointLedgerResponseDto,
  GetOwnPointSummaryResponseDto,
} from '../../dto/point';

@ApiTags('Điểm')
@ApiBearerAuth()
@Controller('points')
export class PointController {
  public constructor(
    @Inject(IGetOwnPointSummaryUseCase)
    private readonly getOwnPointSummaryUseCase: IGetOwnPointSummaryUseCase,
    @Inject(IGetOwnPointLedgerUseCase)
    private readonly getOwnPointLedgerUseCase: IGetOwnPointLedgerUseCase,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Số dư điểm của chính chủ' })
  @ApiOkResponse({ type: ResponseDto.forApi(GetOwnPointSummaryResponseDto) })
  public async getOwnPointSummary(
    @CurrentUser() principal: IAuthPrincipal,
  ): Promise<ResponseDto<IGetOwnPointSummaryResponseDto>> {
    const result = await this.getOwnPointSummaryUseCase.handle({
      userId: principal.userId,
    });
    return ResponseDto.create<IGetOwnPointSummaryResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Get('me/ledger')
  @ApiOperation({ summary: 'Lịch sử điểm của chính chủ' })
  @ApiOkResponse({ type: ResponseDto.forApi(GetOwnPointLedgerResponseDto) })
  public async getOwnPointLedger(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: GetOwnPointLedgerQueryDto,
  ): Promise<ResponseDto<IGetOwnPointLedgerResponseDto>> {
    const result = await this.getOwnPointLedgerUseCase.handle({
      ...query,
      userId: principal.userId,
    });
    return ResponseDto.create<IGetOwnPointLedgerResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }
}
