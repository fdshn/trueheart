import { NotificationTypes } from '../../consts';

export interface INotificationTemplateDto {
  type: NotificationTypes;
  title: string;
  body: string;
  isEnabled: boolean;
  /** Tên các chỗ trống `{tên}` có trong mẫu — giao diện gợi ý cho Admin. */
  placeholders: string[];
  updatedAt: Date;
}

export interface IListNotificationTemplatesResponseDto {
  templates: INotificationTemplateDto[];
}

export interface IUpdateNotificationTemplateDto {
  title: string;
  body: string;
  isEnabled: boolean;
}

export interface IUpdateNotificationTemplateBodyDto {
  template: IUpdateNotificationTemplateDto;
}

export interface IUpdateNotificationTemplateResponseDto {
  template: INotificationTemplateDto;
}
