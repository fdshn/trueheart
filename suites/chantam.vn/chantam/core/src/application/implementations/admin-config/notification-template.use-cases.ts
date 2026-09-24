import {
  IListNotificationTemplatesCommand,
  IListNotificationTemplatesResult,
  IListNotificationTemplatesUseCase,
  IUpdateNotificationTemplateCommand,
  IUpdateNotificationTemplateResult,
  IUpdateNotificationTemplateUseCase,
} from '@/application/contracts/admin-config';
import { NotificationTemplateNotFoundException } from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  INotificationTemplate,
  INotificationTemplateRepository,
} from '@/domain/ports/repository';
import { INotificationTemplateDto } from '@chantam.vn/chantam.core-lib/dto';
import { templatePlaceholders } from '@chantam.vn/chantam.core-lib/models';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

const ManagePermission = 'notification.manage';

function toDto(template: INotificationTemplate): INotificationTemplateDto {
  return {
    type: template.type,
    title: template.title,
    body: template.body,
    isEnabled: template.isEnabled,
    // Gộp chỗ trống của cả tiêu đề lẫn nội dung: giao diện chỉ cần biết mẫu
    // này ăn những biến nào, không cần biết biến nằm ở dòng nào.
    placeholders: [
      ...new Set([
        ...templatePlaceholders(template.title),
        ...templatePlaceholders(template.body),
      ]),
    ],
    updatedAt: template.updatedAt,
  };
}

@Injectable()
export class ListNotificationTemplatesUseCase implements IListNotificationTemplatesUseCase {
  public constructor(
    @Inject(INotificationTemplateRepository)
    private readonly templates: INotificationTemplateRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IListNotificationTemplatesCommand,
  ): Promise<IListNotificationTemplatesResult> {
    if (
      !(await this.admin.hasPermission(command.actorUserId, ManagePermission))
    )
      throw new ForbiddenException();

    // Trả cả mẫu đang tắt: Admin cần thấy mới bật được.
    const templates = await this.templates.listAll();
    return { templates: templates.map(toDto) };
  }
}

@Injectable()
export class UpdateNotificationTemplateUseCase implements IUpdateNotificationTemplateUseCase {
  public constructor(
    @Inject(INotificationTemplateRepository)
    private readonly templates: INotificationTemplateRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IUpdateNotificationTemplateCommand,
  ): Promise<IUpdateNotificationTemplateResult> {
    if (
      !(await this.admin.hasPermission(command.actorUserId, ManagePermission))
    )
      throw new ForbiddenException();

    const title = command.template.title?.trim();
    const body = command.template.body?.trim();
    if (!title || !body)
      throw new ValidationFailedException([
        'template.title và template.body không được để trống',
      ]);

    const updated = await this.templates.update({
      type: command.type,
      title,
      body,
      isEnabled: command.template.isEnabled,
      updatedBy: command.actorUserId,
    });
    if (!updated) throw new NotificationTemplateNotFoundException();

    return { template: toDto(updated) };
  }
}
