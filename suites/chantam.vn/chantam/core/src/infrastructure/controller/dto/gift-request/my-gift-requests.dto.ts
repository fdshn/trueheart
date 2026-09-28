import {
  GiftPostStatuses,
  GiftRequestStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IListMyGiftRequestsResponseDto,
  IMyGiftRequestDto,
  IRejectGiftRequestResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { PaginationQueryDto } from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { Mixin } from 'ts-mixer';
import { GiftRequestDto } from './gift-request.dto';

export class ListMyGiftRequestsQueryDto extends Mixin(PaginationQueryDto) {
  @ApiPropertyOptional({
    enum: GiftRequestStatuses,
    description:
      'Bỏ trống thì trả mọi trạng thái, kể cả đã rút và đã đóng — người dùng cần thấy cả những cái đã xong để biết chuyện gì đã xảy ra.',
  })
  @IsOptional()
  @IsIn(Object.values(GiftRequestStatuses))
  status?: GiftRequestStatuses;
}

export class MyGiftRequestDto implements IMyGiftRequestDto {
  @ApiProperty({ format: 'uuid' }) id: string;

  @ApiProperty({ format: 'uuid' }) postId: string;

  @ApiProperty({ format: 'uuid' }) requesterId: string;

  @ApiProperty() message: string;

  @ApiProperty({ enum: GiftRequestStatuses }) status: GiftRequestStatuses;

  @ApiProperty({ type: String, format: 'date-time' }) queueJoinedAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  withdrawnAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: Date;

  @ApiProperty({
    description:
      'Tiêu đề bài, kèm ngay trên dòng. Không có nó thì danh sách chỉ là một dãy id, và bài đã đóng thì mở ra cũng không còn gì.',
  })
  postTitle: string;

  @ApiProperty({ enum: GiftPostStatuses }) postStatus: GiftPostStatuses;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Ảnh đầu tiên của bài. `null` khi bài không có ảnh.',
  })
  postThumbnailUrl: string | null;

  @ApiProperty({
    description:
      '`true` khi bài không còn nhận yêu cầu. Server tự tính để mỗi client không phải cài lại danh sách trạng thái — chỗ nào cài sót sẽ hiện nút "rút yêu cầu" cho một bài đã biến mất.',
  })
  postClosed: boolean;
}

export class ListMyGiftRequestsResponseDto implements IListMyGiftRequestsResponseDto {
  @ApiProperty({ type: () => [MyGiftRequestDto] })
  requests: IMyGiftRequestDto[];

  @ApiProperty({ type: 'object', additionalProperties: true })
  meta: unknown;
}

export class RejectGiftRequestParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  postId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  requestId: string;
}

export class RejectGiftRequestResponseDto implements IRejectGiftRequestResponseDto {
  @ApiProperty({ type: () => GiftRequestDto })
  request: GiftRequestDto;
}
