import { GiftRequestStatuses } from '@chantam.vn/chantam.core-lib/consts';
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

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
