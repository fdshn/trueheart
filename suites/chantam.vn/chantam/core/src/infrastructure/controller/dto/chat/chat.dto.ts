import { ChatRoomStatuses } from '@chantam.vn/chantam.core-lib/consts';
import {
  IChatMessageDto,
  IChatMessageWindowDto,
  IChatRoomSummaryDto,
  IListChatMessagesParamsDto,
  IListChatMessagesQueryDto,
  IListChatMessagesResponseDto,
  IListChatRoomsQueryDto,
  IListChatRoomsResponseDto,
  IMarkChatRoomReadParamsDto,
  IMarkChatRoomReadResponseDto,
  ISendChatMessageBodyDto,
  ISendChatMessageDto,
  ISendChatMessageParamsDto,
  ISendChatMessageResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  DefaultChatMessageLimit,
  MaxChatMessageLimit,
} from '@chantam.vn/chantam.core-lib/models';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Mixin } from 'ts-mixer';

export class ChatRoomSummaryDto implements IChatRoomSummaryDto {
  @ApiProperty({ format: 'uuid' })
  roomId: string;

  @ApiProperty({ format: 'uuid' })
  transactionId: string;

  @ApiProperty({ format: 'uuid' })
  postId: string;

  @ApiProperty()
  postTitle: string;

  @ApiProperty({ enum: ChatRoomStatuses })
  status: ChatRoomStatuses;

  @ApiProperty()
  counterpartUsername: string;

  @ApiPropertyOptional({ nullable: true })
  counterpartFullName: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastMessageAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  lastMessageBody: string | null;

  @ApiProperty({
    description:
      'Số tin chưa đọc của CHÍNH người gọi. Không đếm tin do họ gửi.',
  })
  unreadCount: number;
}

export class ChatMessageDto implements IChatMessageDto {
  @ApiProperty({ format: 'uuid' })
  messageId: string;

  @ApiProperty({ format: 'uuid' })
  roomId: string;

  @ApiProperty({ format: 'uuid' })
  senderId: string;

  @ApiProperty()
  senderUsername: string;

  @ApiProperty({ maxLength: 2000 })
  body: string;

  @ApiProperty()
  sentAt: Date;

  @ApiProperty({ description: 'Tin do chính người gọi gửi.' })
  isMine: boolean;
}

export class ListChatRoomsQueryDto
  extends Mixin(PaginationQueryDto)
  implements IListChatRoomsQueryDto {}

export class ListChatRoomsResponseDto implements IListChatRoomsResponseDto {
  @ApiProperty({ type: () => [ChatRoomSummaryDto] })
  rooms: IChatRoomSummaryDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class ListChatMessagesParamsDto implements IListChatMessagesParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  roomId: string;
}

export class ListChatMessagesQueryDto implements IListChatMessagesQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: MaxChatMessageLimit,
    default: DefaultChatMessageLimit,
    description: `Số tin tối đa một lần lấy (trần ${MaxChatMessageLimit}).`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MaxChatMessageLimit)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Lấy các tin CŨ HƠN con trỏ này — hướng cuộn lên xem lịch sử. Không truyền gì thì trả về cửa sổ mới nhất. Con trỏ hỏng được coi như không truyền, không phải lỗi.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  before?: string;

  @ApiPropertyOptional({
    description:
      'Lấy các tin MỚI HƠN con trỏ này — hướng bắt kịp sau khi mất kết nối. Truyền cùng `before` thì `before` thắng.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  after?: string;
}

export class ChatMessageWindowDto implements IChatMessageWindowDto {
  @ApiProperty({ example: 30 })
  limit: number;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Truyền vào `before` để cuộn tiếp lên. `null` khi cửa sổ rỗng.',
  })
  oldestCursor: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Truyền vào `after` để bắt kịp tin mới. `null` khi cửa sổ rỗng.',
  })
  newestCursor: string | null;

  @ApiProperty({ description: 'Còn tin cũ hơn nữa không.' })
  hasMoreBefore: boolean;

  @ApiProperty({ description: 'Còn tin mới hơn không.' })
  hasMoreAfter: boolean;
}

export class ListChatMessagesResponseDto implements IListChatMessagesResponseDto {
  @ApiProperty({ type: () => ChatRoomSummaryDto })
  room: IChatRoomSummaryDto;

  @ApiProperty({
    type: () => [ChatMessageDto],
    description: 'Mới nhất trước, bất kể lấy theo `before` hay `after`.',
  })
  messages: IChatMessageDto[];

  @ApiProperty({ type: () => ChatMessageWindowDto })
  window: IChatMessageWindowDto;
}

export class SendChatMessageParamsDto implements ISendChatMessageParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  roomId: string;
}

export class SendChatMessageDto implements ISendChatMessageDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @IsString()
  @Length(1, 2000)
  body: string;
}

export class SendChatMessageBodyDto implements ISendChatMessageBodyDto {
  @ApiProperty({ type: () => SendChatMessageDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SendChatMessageDto)
  message: ISendChatMessageDto;
}

export class SendChatMessageResponseDto implements ISendChatMessageResponseDto {
  @ApiProperty({ type: () => ChatMessageDto })
  message: IChatMessageDto;
}

export class MarkChatRoomReadParamsDto implements IMarkChatRoomReadParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  roomId: string;
}

export class MarkChatRoomReadResponseDto implements IMarkChatRoomReadResponseDto {
  @ApiProperty({ format: 'uuid' })
  roomId: string;

  @ApiProperty()
  readAt: Date;

  @ApiProperty()
  unreadCount: number;
}
