import { IAdminChatMessageDto } from '@/application/contracts/chat';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

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
