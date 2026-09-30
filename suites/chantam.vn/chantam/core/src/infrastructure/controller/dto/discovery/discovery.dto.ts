import {
  PostTypes,
  PublicDiscoveryPostType,
} from '@chantam.vn/chantam.core-lib/consts';
import { IDiscoveryConfigResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty } from '@nestjs/swagger';

export class DiscoveryConfigResponseDto implements IDiscoveryConfigResponseDto {
  @ApiProperty({ example: 100 })
  minRadiusMeters: number;

  @ApiProperty({
    description:
      'Bán kính áp dụng khi client gửi toạ độ mà bỏ trống radiusMeters. Trước 30/09 bỏ trống nghĩa là không lọc bán kính, tức quét cả nước.',
  })
  defaultRadiusMeters: number;

  @ApiProperty({ example: 50_000 })
  maxRadiusMeters: number;

  @ApiProperty({ example: 20 })
  defaultPageSize: number;

  @ApiProperty({ example: 50 })
  maxPageSize: number;

  @ApiProperty({ enum: [PostTypes.OFFER, PostTypes.WANTED], isArray: true })
  supportedPostTypes: PublicDiscoveryPostType[];
}
