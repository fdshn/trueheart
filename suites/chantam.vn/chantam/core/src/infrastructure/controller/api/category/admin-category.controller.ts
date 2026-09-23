import { IGetCategoryTreeUseCase } from '@/application/contracts/category';
import { CurrentUser, IAuthPrincipal } from '@chantam/service.auth-lib';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { Controller, Get, Inject } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GetCategoryTreeResponseDto } from '../../dto/category';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - Danh mục')
@ApiBearerAuth()
@Controller('admin/categories')
export class AdminCategoryController {
  public constructor(
    @Inject(IGetCategoryTreeUseCase)
    private readonly getTree: IGetCategoryTreeUseCase,
  ) {}

  @Get()
  @RequiresPermission('category.read')
  @ApiOperation({ summary: 'Cây danh mục gồm cả mục đã tắt' })
  @ApiOkResponse({ type: ResponseDto.forApi(GetCategoryTreeResponseDto) })
  public async list(@CurrentUser() principal: IAuthPrincipal) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getTree.handle({
          actorUserId: principal.userId,
          includeInactive: true,
        }),
      )
      .build();
  }
}
