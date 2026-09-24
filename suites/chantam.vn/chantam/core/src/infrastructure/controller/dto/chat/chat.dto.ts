import {
  ChatRoomStatuses,
  MaxContentMediaPerItem,
} from '@chantam.vn/chantam.core-lib/consts';
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
  IRequestChatMediaUploadBodyDto,
  IRequestChatMediaUploadResponseDto,
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
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsIn,
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

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Ngày tin nhắn của phòng này sẽ bị xoá, ĐÃ CHỐT lúc khoá phòng. Admin đổi cấu hình sau đó không dịch ngày này. `null` khi phòng còn mở, hoặc khi đã gỡ hạn để giữ chứng cứ.',
  })
  purgeAfter: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  purgedAt: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Đã xoá bao nhiêu tin — để trả lời được khi có người hỏi.',
  })
  purgedMessageCount: number | null;
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

  @ApiProperty({
    type: [String],
    description: 'Key ảnh đính kèm. Rỗng khi tin chỉ có chữ.',
  })
  mediaKeys: string[];

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
  @ApiProperty({
    minLength: 0,
    maxLength: 2000,
    description:
      'Có thể để rỗng khi gửi kèm ảnh — một tin chỉ có ảnh là hợp lệ. Nhưng rỗng cả hai thì bị từ chối.',
  })
  @IsString()
  @Length(0, 2000)
  body: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: MaxContentMediaPerItem,
    description:
      'Key ảnh đã tải lên qua `message-media/upload-url`, tối đa 3. Chat chỉ ghi thêm nên ảnh phải đi cùng lần gửi này.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MaxContentMediaPerItem)
  @IsString({ each: true })
  @Length(1, 500, { each: true })
  mediaKeys?: string[];
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

const AllowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const MaxMediaBytes = 5 * 1024 * 1024;

export class RequestChatMediaUploadDto {
  @ApiProperty({ enum: AllowedImageTypes, example: 'image/webp' })
  @IsIn(AllowedImageTypes)
  contentType: string;

  @ApiProperty({ minimum: 1, maximum: MaxMediaBytes, example: 512_000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MaxMediaBytes)
  contentLength: number;
}

export class RequestChatMediaUploadBodyDto implements IRequestChatMediaUploadBodyDto {
  @ApiProperty({ type: () => RequestChatMediaUploadDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => RequestChatMediaUploadDto)
  upload: RequestChatMediaUploadDto;
}

export class ChatMediaUploadDto {
  @ApiProperty() key: string;
  @ApiProperty() uploadUrl: string;
  @ApiProperty({ example: 300 }) expiresInSeconds: number;
  @ApiProperty() publicUrl: string;
}

export class RequestChatMediaUploadResponseDto implements IRequestChatMediaUploadResponseDto {
  @ApiProperty({ type: () => ChatMediaUploadDto })
  upload: ChatMediaUploadDto;
}
