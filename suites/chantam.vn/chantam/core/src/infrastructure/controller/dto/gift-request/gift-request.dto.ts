import {
  GiftRequestStatuses,
  GiftRequestStatusReasons,
} from '@chantam.vn/chantam.core-lib/consts';
import { IGiftRequestDto } from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty } from '@nestjs/swagger';

export class GiftRequestDto implements IGiftRequestDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  postId: string;

  @ApiProperty()
  requesterId: string;

  @ApiProperty()
  message: string;

  @ApiProperty({ enum: GiftRequestStatuses })
  status: GiftRequestStatuses;

  @ApiProperty()
  queueJoinedAt: Date;

  @ApiProperty({ nullable: true })
  withdrawnAt: Date | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description:
      'Bài Muốn Tặng người gửi mang ra, khi lời tặng đi qua ' +
      '`POST /posts/{wantedPostId}/offer-gift`. `null` ở yêu cầu xin nhận thường.',
  })
  offeringPostId: string | null;

  @ApiProperty({
    minimum: 1,
    example: 2,
    description:
      'Số món xin. Duyệt là duyệt ĐỦ số này — không duyệt một phần, không tự giảm.',
  })
  requestedQuantity: number;

  @ApiProperty({
    enum: GiftRequestStatusReasons,
    nullable: true,
    description:
      'Lý do của `STANDBY` (`OUT_OF_STOCK`, `INSUFFICIENT_QUANTITY`) hoặc `CANCELLED` (`POST_COMPLETED`, `TRANSACTION_CANCELLED`). `null` ở trạng thái khác.',
  })
  statusReason: GiftRequestStatusReasons | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
