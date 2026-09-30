import { ChatFlagActions } from '@/application/contracts/admin-config';
import { PaginationMetaDto } from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ChatMessageFlagDto {
  @ApiProperty({ format: 'uuid' }) flagId: string;
  @ApiProperty({ format: 'uuid' }) messageId: string;
  @ApiProperty({ format: 'uuid' }) roomId: string;
  @ApiProperty({ format: 'uuid' }) senderId: string;
  @ApiProperty() senderUsername: string;

  @ApiProperty({
    enum: ['BLOCK', 'REVIEW'],
    description:
      'CHỈ để xếp thứ tự hàng đợi. Chat gắn cờ chứ không chặn, nên không tin nào bị giữ lại — kể cả mức BLOCK.',
  })
  severity: string;

  @ApiProperty({
    type: [String],
    description:
      'Mục đã khớp, dạng ĐÃ CHUẨN HOÁ đúng như bộ lọc thấy. Dạng gốc không giải thích được vì sao một câu khớp.',
  })
  matchedTerms: string[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'null khi tin đã bị thu hồi. Dòng cờ vẫn hiện vì nó là bằng chứng.',
  })
  body: string | null;

  @ApiProperty() recalled: boolean;
  @ApiProperty() createdAt: Date;
}

export class GetChatFlagQueueResponseDto {
  @ApiProperty({ type: () => [ChatMessageFlagDto] })
  flags: ChatMessageFlagDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class GetChatFlagPendingCountResponseDto {
  @ApiProperty({ description: 'Số cờ chưa xem, cho badge Admin.' })
  pending: number;
}

export class ChatFlagQueueQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class ReviewChatFlagDto {
  @ApiProperty({
    enum: ChatFlagActions,
    description:
      '`MESSAGE_REMOVED` KHÔNG tự gỡ tin nhắn — gỡ đi qua `DELETE /admin/chat/messages/:messageId`. Ở đây chỉ GHI LẠI quyết định, vì gộp hai việc thì một lượt gỡ thất bại để lại cờ nói "đã gỡ".',
  })
  @IsIn([...ChatFlagActions])
  action: (typeof ChatFlagActions)[number];

  @ApiPropertyOptional({ description: 'Hiện trong audit log.' })
  @IsOptional()
  @IsString()
  @Length(3, 500)
  note?: string;
}

export class ReviewChatFlagBodyDto {
  @ApiProperty({ type: () => ReviewChatFlagDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ReviewChatFlagDto)
  review: ReviewChatFlagDto;
}

export class ChatFlagParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  flagId: string;
}
