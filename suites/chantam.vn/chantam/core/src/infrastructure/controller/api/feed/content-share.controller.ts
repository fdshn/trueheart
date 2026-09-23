import { IRecordContentShareUseCase } from '@/application/contracts/feed';
import { PostNotFoundException } from '@/domain/exceptions';
import { ContentSubjectTypes } from '@chantam.vn/chantam.core-lib/consts';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { Body, Controller, Inject, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  RecordShareBodyDto,
  RecordShareResponseDto,
  ShareSubjectParamsDto,
} from '../../dto/feed';

@ApiTags('Tương tác bảng tin')
@Controller()
export class ContentShareController {
  public constructor(
    @Inject(IRecordContentShareUseCase)
    private readonly recordShareUseCase: IRecordContentShareUseCase,
  ) {}

  @Post('posts/:subjectId/shares')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Ghi nhận một lượt chia sẻ bài đăng',
    description:
      'Không nhân bản nội dung lên tường người chia sẻ — một bài Muốn Tặng là lời hứa của tác giả, bản sao trên tường người khác là lời hứa họ không thực hiện được. ' +
      'Server chỉ ghi nhận lượt và trả đường dẫn chuẩn; mở khay chia sẻ của hệ điều hành là việc của client. ' +
      'Cùng một người chia sẻ hai lần là hai lượt — đây là đếm lần mở khay, không phải "đã từng chia sẻ hay chưa".',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(RecordShareResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, PostNotFoundException)
  public async recordPostShare(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: ShareSubjectParamsDto,
    @Body() body: RecordShareBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.recordShareUseCase.handle({
          userId: principal.userId,
          subjectType: ContentSubjectTypes.POST,
          subjectId: params.subjectId,
          channel: body.share.channel,
        }),
      )
      .build();
  }
}
