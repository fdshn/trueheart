import {
  IListNotificationTemplatesUseCase,
  IUpdateNotificationTemplateUseCase,
} from '@/application/contracts/admin-config';
import { NotificationTemplateNotFoundException } from '@/domain/exceptions';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Body, Controller, Get, Inject, Param, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ListNotificationTemplatesResponseDto,
  NotificationTemplateParamsDto,
  UpdateNotificationTemplateBodyDto,
  UpdateNotificationTemplateResponseDto,
} from '../../dto/admin-config/notification-template.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - Mẫu thông báo')
@ApiBearerAuth()
@Controller('admin/notification-templates')
export class NotificationTemplateController {
  public constructor(
    @Inject(IListNotificationTemplatesUseCase)
    private readonly listUseCase: IListNotificationTemplatesUseCase,
    @Inject(IUpdateNotificationTemplateUseCase)
    private readonly updateUseCase: IUpdateNotificationTemplateUseCase,
  ) {}

  @Get()
  @RequiresPermission('notification.manage')
  @ApiOperation({
    summary: 'Danh sách mẫu thông báo',
    description:
      'Gồm cả mẫu đang TẮT — Admin cần thấy mới bật được. Mẫu tắt thì thông báo dùng chữ mặc định trong code.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(ListNotificationTemplatesResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async list(@CurrentUser() principal: IAuthPrincipal) {
    return ResponseDto.create()
      .succeed()
      .attach(await this.listUseCase.handle({ actorUserId: principal.userId }))
      .build();
  }

  @Put(':type')
  @RequiresPermission('notification.manage')
  @ApiOperation({
    summary: 'Sửa nội dung hoặc bật/tắt một mẫu',
    description:
      'Seed ban đầu là ĐÚNG chữ đang hardcode, nên bật lên không đổi một chữ nào — đó là cách để biết đường mẫu chạy đúng trước khi sửa nội dung thật. ' +
      'Chỗ trống `{tên}` thiếu giá trị sẽ hiện nguyên văn chứ không bị xoá: một thông báo hiện ra `{preview}` là lỗi thấy ngay, còn một câu cụt giữa chừng trông như nội dung thật.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(UpdateNotificationTemplateResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [
      ValidationFailedException,
      ['template.title và template.body không được để trống'],
    ],
    NotificationTemplateNotFoundException,
  )
  public async update(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: NotificationTemplateParamsDto,
    @Body() body: UpdateNotificationTemplateBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.updateUseCase.handle({
          actorUserId: principal.userId,
          type: params.type,
          template: body.template,
        }),
      )
      .build();
  }
}
