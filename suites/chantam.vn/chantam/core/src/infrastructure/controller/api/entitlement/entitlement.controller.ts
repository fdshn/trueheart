import { IGetOwnEntitlementsUseCase } from '@/application/contracts/entitlement';
import { IGetOwnEntitlementsResponseDto } from '@chantam.vn/chantam.core-lib/dto';
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
import { GetOwnEntitlementsResponseDto } from '../../dto/entitlement/entitlement.dto';

@ApiTags('Quyền và giới hạn')
@ApiBearerAuth()
@Controller('me/entitlements')
export class EntitlementController {
  public constructor(
    @Inject(IGetOwnEntitlementsUseCase)
    private readonly getOwnEntitlementsUseCase: IGetOwnEntitlementsUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Quyền và giới hạn hiện tại của chính chủ' })
  @ApiOkResponse({ type: ResponseDto.forApi(GetOwnEntitlementsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors)
  public async getOwnEntitlements(
    @CurrentUser() principal: IAuthPrincipal,
  ): Promise<ResponseDto<IGetOwnEntitlementsResponseDto>> {
    const result = await this.getOwnEntitlementsUseCase.handle({
      userId: principal.userId,
    });

    return ResponseDto.create<IGetOwnEntitlementsResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }
}
