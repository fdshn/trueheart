import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import {
  IListNotificationTemplatesResponseDto,
  INotificationTemplateDto,
  IUpdateNotificationTemplateBodyDto,
  IUpdateNotificationTemplateDto,
  IUpdateNotificationTemplateResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  MaxNotificationBodyLength,
  MaxNotificationTitleLength,
} from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsEnum,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

export class NotificationTemplateParamsDto {
  @ApiProperty({ enum: NotificationTypes })
  @IsEnum(NotificationTypes)
  type: NotificationTypes;
}

export class NotificationTemplateDto implements INotificationTemplateDto {
  @ApiProperty({ enum: NotificationTypes }) type: NotificationTypes;
  @ApiProperty() title: string;
  @ApiProperty() body: string;

  @ApiProperty({
    description: 'Tắt thì dispatch dùng chữ do nơi gọi dựng, y như trước.',
  })
  isEnabled: boolean;

  @ApiProperty({
    type: [String],
    description: 'Chỗ trống `{tên}` mẫu này ăn, gộp cả tiêu đề lẫn nội dung.',
  })
  placeholders: string[];

  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: Date;
}

export class ListNotificationTemplatesResponseDto implements IListNotificationTemplatesResponseDto {
  @ApiProperty({ type: () => [NotificationTemplateDto] })
  templates: INotificationTemplateDto[];
}

export class UpdateNotificationTemplateDto implements IUpdateNotificationTemplateDto {
  @ApiProperty({ maxLength: MaxNotificationTitleLength })
  @IsString()
  @Length(1, MaxNotificationTitleLength)
  title: string;

  @ApiProperty({
    maxLength: MaxNotificationBodyLength,
    description:
      'Dùng `{tên}` cho chỗ trống. Chỗ trống không có giá trị sẽ hiện nguyên văn chứ không bị xoá — để lỗi nhìn thấy được ngay.',
  })
  @IsString()
  @Length(1, MaxNotificationBodyLength)
  body: string;

  @ApiProperty()
  @IsBoolean()
  isEnabled: boolean;
}

export class UpdateNotificationTemplateBodyDto implements IUpdateNotificationTemplateBodyDto {
  @ApiProperty({ type: () => UpdateNotificationTemplateDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => UpdateNotificationTemplateDto)
  template: UpdateNotificationTemplateDto;
}

export class UpdateNotificationTemplateResponseDto implements IUpdateNotificationTemplateResponseDto {
  @ApiProperty({ type: () => NotificationTemplateDto })
  template: INotificationTemplateDto;
}
