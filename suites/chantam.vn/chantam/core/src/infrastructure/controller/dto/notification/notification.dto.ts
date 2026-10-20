import {
  NotificationGroups,
  NotificationTargetTypes,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
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
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Mixin } from 'ts-mixer';
import { QueryBoolean } from '../query-boolean';

export class NotificationDto implements INotificationDto {
  @ApiProperty({ format: 'uuid' })
  notificationId: string;

  @ApiProperty({ enum: NotificationTypes })
  type: NotificationTypes;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Đối tượng SINH RA sự kiện (vd `GIFT_REQUEST`, `CHARITY_CONTRIBUTION`). Không dùng để điều hướng — dùng `targetType`.',
  })
  referenceType: string | null;

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description:
      'Id của đối tượng sinh ra sự kiện. Màn đích có thể dùng nó để cuộn tới / tô sáng đúng dòng (vd lượt đóng góp trong màn hoạt động).',
  })
  referenceId: string | null;

  @ApiPropertyOptional({
    enum: NotificationTargetTypes,
    nullable: true,
    description:
      'Màn PHẢI mở khi bấm — mỗi giá trị ứng với một endpoint chi tiết: `POST` → `GET /posts/:targetId`, `GIFT_TRANSACTION` → `GET /transactions/:targetId`, `CHAT_ROOM` → `GET /chat/rooms/:targetId/messages`, `CHARITY_CAMPAIGN` → `GET /campaigns/:targetId`, `DHARMA_THREAD` → `GET /dharma/threads/:targetId`, `RANK` → `GET /ranks/me`, `REFERRAL` → `GET /referrals/me`. `null` là không có màn — mở hộp thư. Không suy loại id từ `type`.',
  })
  targetType: NotificationTargetTypes | null;

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description:
      'Id công khai (global UUID) để gọi endpoint chi tiết của `targetType`. `null` khi `targetType` là màn "của tôi" (`RANK`, `REFERRAL`) hoặc không có màn. Đích đã bị xoá hoặc người xem không còn quyền thì endpoint trả 404.',
  })
  targetId: string | null;

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
  // Query string luôn là chuỗi: xem `QueryBoolean`.
  @QueryBoolean()
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

export class NotificationPreferenceDto {
  @ApiProperty({ enum: NotificationGroups })
  group: NotificationGroups;

  @ApiProperty({
    description:
      '`true` là đã TẮT tiếng nhóm này. Thông báo vẫn được ghi vào hộp thư — tắt chuông không phải tắt bản ghi.',
  })
  muted: boolean;

  @ApiProperty({
    enum: NotificationTypes,
    isArray: true,
    description:
      'Những loại thuộc nhóm này, để client khỏi tự đoán và khỏi lệch khi backend thêm loại mới.',
  })
  types: NotificationTypes[];
}

export class ListNotificationPreferencesResponseDto {
  @ApiProperty({ type: () => [NotificationPreferenceDto] })
  preferences: NotificationPreferenceDto[];
}

export class SetNotificationPreferenceDto {
  @ApiProperty({ enum: NotificationGroups })
  @IsIn(Object.values(NotificationGroups))
  group: NotificationGroups;

  @ApiProperty({ example: true })
  @IsBoolean()
  muted: boolean;
}

export class SetNotificationPreferenceBodyDto {
  @ApiProperty({ type: () => SetNotificationPreferenceDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SetNotificationPreferenceDto)
  preference: SetNotificationPreferenceDto;
}
