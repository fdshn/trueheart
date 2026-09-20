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
  @ApiOperation({
    summary: 'Quyền và giới hạn hiện tại của chính chủ',
    description:
      '`used`/`remaining` đếm theo ĐÚNG định nghĩa mà quota thật sự chặn lúc đăng bài — hai bên lệch nhau thì API nói một đằng, lúc đăng chặn một nẻo. Hạn mức đăng bài dùng chung một rổ bài đang mở, không tách theo loại bài. Giá trị đọc từ bản chính sách đang hiệu lực nên admin đổi là có tác dụng ngay.',
  })
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
