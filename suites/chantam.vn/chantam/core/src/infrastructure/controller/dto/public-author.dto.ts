import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { IPublicAuthorSummaryDto } from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty } from '@nestjs/swagger';

/** Author summary chuẩn — bài đăng, bình luận, Diễn đàn. Không có email/SĐT. */
export class PublicAuthorSummaryDto implements IPublicAuthorSummaryDto {
  @ApiProperty() username: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Họ tên công khai (từ 25/10/2026). `null` khi chưa khai.',
  })
  fullName: string | null;

  @ApiProperty({ type: String, nullable: true }) avatarUrl: string | null;

  @ApiProperty({ enum: UserRanks }) rank: UserRanks;
}
