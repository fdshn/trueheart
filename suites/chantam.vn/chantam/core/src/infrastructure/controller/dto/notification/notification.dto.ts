import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import {
  IListNotificationsQueryDto,
  IListNotificationsResponseDto,
  IMarkNotificationsReadBodyDto,
  IMarkNotificationsReadDto,
  IMarkNotificationsReadResponseDto,
  INotificationDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Mixin } from 'ts-mixer';

export class NotificationDto implements INotificationDto {
  @ApiProperty({ format: 'uuid' })
  notificationId: string;

  @ApiProperty({ enum: NotificationTypes })
  type: NotificationTypes;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiPropertyOptional({ nullable: true })
  referenceType: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  referenceId: string | null;

  @ApiPropertyOptional({ nullable: true })
  readAt: Date | null;

  @ApiProperty()
  createdAt: Date;
}

export class ListNotificationsQueryDto
  extends Mixin(PaginationQueryDto)
  implements IListNotificationsQueryDto
{
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  // Query string luôn là chuỗi: 'false' là truthy nên `Boolean('false')` ra
  // `true`, và bộ lọc sẽ bật khi người dùng vừa tắt nó.
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unreadOnly?: boolean;
}

export class ListNotificationsResponseDto implements IListNotificationsResponseDto {
  @ApiProperty({ type: () => [NotificationDto] })
  notifications: INotificationDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;

  @ApiProperty({
    description:
      'Tổng số chưa đọc, KHÔNG phụ thuộc trang hay bộ lọc đang xem — dùng cho badge.',
  })
  unreadCount: number;
}

export class MarkNotificationsReadDto implements IMarkNotificationsReadDto {
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: 200,
    description: 'Bỏ trống thì đánh dấu TẤT CẢ thông báo chưa đọc.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  notificationIds?: string[];
}

export class MarkNotificationsReadBodyDto implements IMarkNotificationsReadBodyDto {
  @ApiProperty({ type: () => MarkNotificationsReadDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => MarkNotificationsReadDto)
  notifications: IMarkNotificationsReadDto;
}

export class MarkNotificationsReadResponseDto implements IMarkNotificationsReadResponseDto {
  @ApiProperty()
  markedCount: number;

  @ApiProperty()
  unreadCount: number;
}
