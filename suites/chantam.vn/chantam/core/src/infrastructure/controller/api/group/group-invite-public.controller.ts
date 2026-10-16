import { IPreviewGroupInviteUseCase } from '@/application/contracts/group';
import { GroupInviteInvalidException } from '@/domain/exceptions';
import { Public } from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  GroupInviteCodeParamDto,
  PreviewGroupInviteResponseDto,
} from '../../dto/group';

/**
 * Trang mời CÔNG KHAI — người cầm link chưa có tài khoản.
 *
 * Tách khỏi `GroupController` vì lớp đó mang `@ApiBearerAuth` cho mọi route; một
 * route công khai nằm trong đó sẽ hiện ổ khoá trên Swagger.
 */
@ApiTags('Nhóm')
@Controller('groups/invites')
export class GroupInvitePublicController {
  public constructor(
    @Inject(IPreviewGroupInviteUseCase)
    private readonly previewUseCase: IPreviewGroupInviteUseCase,
  ) {}

  @Get(':inviteCode')
  @Public()
  @ApiOperation({
    summary: 'Xem trước nhóm theo mã mời (trang /invite/:code)',
    description:
      'Không cần đăng nhập. Trả tên, khu vực, mô tả, ảnh, số thành viên và username chủ nhóm — đủ để vẽ trang mời trước khi người dùng đăng ký bằng `POST /auth/register` với `registration.inviteCode`.\n\n' +
      'KHÔNG trả toạ độ tâm nhóm (chụp từ Vị trí mặc định của Owner) hay id nội bộ. Mã sai và nhóm đã giải tán cùng trả `GROUP_INVITE_INVALID` — y như lúc đăng ký bằng mã đó, để người lạ không dò được mã nào từng tồn tại.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(PreviewGroupInviteResponseDto) })
  @ApiErrorResponses(GroupInviteInvalidException)
  public async preview(
    @Param() params: GroupInviteCodeParamDto,
  ): Promise<ResponseDto<PreviewGroupInviteResponseDto>> {
    return ResponseDto.create<PreviewGroupInviteResponseDto>()
      .succeed()
      .attach(
        await this.previewUseCase.handle({ inviteCode: params.inviteCode }),
      )
      .build();
  }
}
