import {
  IGetOwnPointLedgerUseCase,
  IGetOwnPointSummaryUseCase,
} from '@/application/contracts/point';
import {
  IGetOwnPointLedgerResponseDto,
  IGetOwnPointSummaryResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
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
  @ApiOperation({
    summary: 'Số dư điểm của chính chủ',
    description:
      'Trả HAI con số khác nhau, đừng nhầm: `balance` là điểm TIÊU ĐƯỢC và giảm khi dùng; `lifetime` là điểm TÍCH LUỸ và chỉ tăng. Thứ hạng đọc `lifetime`, nên tiêu điểm không làm tụt hạng.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetOwnPointSummaryResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors)
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
  @ApiOperation({
    summary: 'Lịch sử điểm của chính chủ',
    description:
      'Ledger là APPEND-ONLY: không có sửa, không có xoá, và trigger ở database chặn cả hai. Đảo một bút toán là ghi thêm bút toán âm, nên lịch sử luôn cộng đúng ra số dư hiện tại. Sắp xếp mới nhất trước, phân trang bằng `page`/`pageSize`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetOwnPointLedgerResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [
    ValidationFailedException,
    ['pageSize: pageSize must not be greater than 50'],
  ])
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
