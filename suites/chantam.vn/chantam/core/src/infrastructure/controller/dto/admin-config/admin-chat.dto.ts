import { IAdminChatMessageDto } from '@/application/contracts/chat';
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
    default: 200,
    minimum: 1,
    maximum: 500,
    description:
      'Số tin tối đa. Trần 500 để một phòng dài không kéo sập response — một cuộc dài hơn thế thì Admin cần công cụ khác, không phải một trang JSON.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class AdminChatMessageDto implements IAdminChatMessageDto {
  @ApiProperty({ format: 'uuid' }) messageId: string;

  @ApiProperty({ format: 'uuid' }) senderId: string;

  @ApiProperty() senderUsername: string;

  @ApiProperty({ description: 'Rỗng khi tin đã bị thu hồi.' })
  body: string;

  @ApiProperty({ type: [String] }) mediaKeys: string[];

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

  @ApiProperty({ format: 'uuid' }) postId: string;

  @ApiProperty({ format: 'uuid' }) giverId: string;

  @ApiProperty({ format: 'uuid' }) receiverId: string;

  @ApiProperty({ type: () => [AdminChatMessageDto] })
  messages: IAdminChatMessageDto[];
}
