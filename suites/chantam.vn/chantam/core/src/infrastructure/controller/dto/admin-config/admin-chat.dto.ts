import {
  IAdminChatMessageDto,
  IAdminChatMessageWindow,
} from '@/application/contracts/chat';
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

export class RemoveChatMessageParamDto {
  @ApiProperty({ format: 'uuid', description: 'Tin nhắn cần gỡ.' })
  @IsUUID()
  messageId: string;
}

export class RemoveChatMessageDto {
  @ApiProperty({
    minLength: 10,
    maxLength: 500,
    description:
      'Lý do gỡ. BẮT BUỘC và vào audit log: gỡ nội dung của người khác là quyết định sẽ bị hỏi lại.',
  })
  @IsString()
  @Length(10, 500)
  reason: string;
}

export class RemoveChatMessageBodyDto {
  @ApiProperty({ type: () => RemoveChatMessageDto })
  // `@IsDefined()` chứ không chỉ `@ValidateNested()`: thiếu nó thì body rỗng đi
  // qua được validation rồi nổ ở tầng dưới thành 500. `body-wrapper-guard.spec`
  // canh đúng chỗ này và đã bắt được lần tôi quên.
  @IsDefined()
  @ValidateNested()
  @Type(() => RemoveChatMessageDto)
  removal: RemoveChatMessageDto;
}

export class RemoveChatMessageResponseDto {
  @ApiProperty({ format: 'uuid' }) messageId: string;
  @ApiProperty({ format: 'uuid' }) roomId: string;
}

export class AdminChatRoomParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  roomId: string;
}

export class AdminChatRoomQueryDto {
  @ApiPropertyOptional({
    default: 50,
    minimum: 1,
    maximum: 200,
    description:
      'Số tin một lần tải. Phòng dài hơn thì tải tiếp bằng `before` / `after` — không kéo cả phòng về một response.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Tải các tin CŨ HƠN — truyền `window.oldestCursor` khi Admin cuộn lên đầu. Thắng `after` và `aroundMessageId`. Con trỏ hỏng coi như không truyền.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  before?: string;

  @ApiPropertyOptional({
    description:
      'Tải các tin MỚI HƠN — truyền `window.newestCursor` khi Admin cuộn xuống cuối. Thắng `aroundMessageId`.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  after?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Mở cửa sổ quanh đúng tin này (nửa trước gồm chính nó, nửa sau). Dùng khi đi từ báo xấu `CHAT_MESSAGE`. Tin không thuộc phòng thì trả cửa sổ mới nhất.',
  })
  @IsOptional()
  @IsUUID()
  aroundMessageId?: string;
}

export class AdminChatMessageWindowDto implements IAdminChatMessageWindow {
  @ApiProperty({ example: 50 }) limit: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Truyền vào `before` để tải tin cũ hơn. `null` khi cửa sổ rỗng.',
  })
  oldestCursor: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Truyền vào `after` để tải tin mới hơn. `null` khi cửa sổ rỗng.',
  })
  newestCursor: string | null;

  @ApiProperty({ description: 'Còn tin cũ hơn cửa sổ này không.' })
  hasMoreBefore: boolean;

  @ApiProperty({ description: 'Còn tin mới hơn cửa sổ này không.' })
  hasMoreAfter: boolean;
}

export class AdminChatMessageDto implements IAdminChatMessageDto {
  @ApiProperty({ format: 'uuid' }) messageId: string;

  @ApiProperty({ format: 'uuid' }) senderId: string;

  @ApiProperty() senderUsername: string;

  @ApiProperty({ description: 'Rỗng khi tin đã bị thu hồi.' })
  body: string;

  @ApiProperty({ type: [String] }) mediaKeys: string[];

  @ApiProperty({
    type: [String],
    description:
      'URL mở được của từng ảnh, cùng thứ tự với `mediaKeys` — cùng kiểu URL công khai (`storage.publicBaseUrl` + key) mà người gửi nhận lúc tải lên. Bucket là công khai nên đây KHÔNG phải URL ký có hạn. Rỗng khi tin không có ảnh hoặc đã bị gỡ.',
  })
  mediaUrls: string[];

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Khác `null` nghĩa là người gửi đã thu hồi. Dòng vẫn còn để Admin thấy ở đây từng có một tin — chính việc thu hồi sau khi gửi bậy là thứ đáng biết.',
  })
  recalledAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' }) sentAt: Date;
}

export class AdminChatRoomResponseDto {
  @ApiProperty({ format: 'uuid' }) roomId: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      '`null` với phòng `DIRECT_USER`. Phòng loại này `giverId`/`receiverId` chỉ là hai người, không mang nghĩa người tặng/người nhận.',
  })
  postId: string | null;

  @ApiProperty({ format: 'uuid' }) giverId: string;

  @ApiProperty({ format: 'uuid' }) receiverId: string;

  @ApiProperty({
    type: () => [AdminChatMessageDto],
    description: 'Cũ nhất trước, bất kể tải theo hướng nào.',
  })
  messages: IAdminChatMessageDto[];

  @ApiProperty({ type: () => AdminChatMessageWindowDto })
  window: IAdminChatMessageWindow;
}
