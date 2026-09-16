import { GiftPostCategories } from '@chantam.vn/chantam.core-lib/consts';
import {
  IGetNearbyGiftPostsQueryDto,
  IGetNearbyGiftPostsResponseDto,
  INearbyGiftPostDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IGiftPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import { MaxSearchRadiusMeters } from '@chantam/service.persistency-lib/geo';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Mixin } from 'ts-mixer';
import { GiftPostEntity } from '../../../entity/gift-post.entity';

/**
 * Query của bảng tin "quanh đây".
 *
 * Trộn `PaginationQueryDto` bằng ts-mixer để mọi endpoint danh sách có cùng
 * tham số phân trang mà không phải chép lại.
 */
export class GetNearbyGiftPostsQueryDto
  extends Mixin(PaginationQueryDto)
  implements IGetNearbyGiftPostsQueryDto
{
  @ApiProperty({
    example: 10.7724,
    description:
      'Vĩ độ của người tìm (-90 đến 90). Đây là vị trí NGƯỜI XEM đang đứng, ' +
      'không phải vị trí bài đăng.',
  })
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @ApiProperty({
    example: 106.698,
    description: 'Kinh độ của người tìm (-180 đến 180).',
  })
  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @ApiProperty({
    example: 5_000,
    minimum: 100,
    maximum: MaxSearchRadiusMeters,
    description:
      `Bán kính tìm kiếm, tính bằng mét (100 – ${MaxSearchRadiusMeters}). ` +
      'Có trần để một truy vấn không quét cả nước rồi làm nghẽn database.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(MaxSearchRadiusMeters)
  radiusMeters: number;

  @ApiPropertyOptional({
    enum: GiftPostCategories,
    description: 'Lọc theo danh mục. Bỏ trống thì lấy mọi danh mục.',
  })
  @IsOptional()
  @IsEnum(GiftPostCategories)
  category?: GiftPostCategories;
}

export class NearbyGiftPostDto implements INearbyGiftPostDto {
  @ApiProperty({
    type: () => GiftPostEntity,
    description: 'Bài đăng. Toạ độ trong đây đã được làm nhiễu.',
  })
  giftPost: IGiftPostEntity;

  @ApiProperty({
    example: 400,
    description:
      'Khoảng cách tới điểm truy vấn, **làm tròn xuống bội số của 100m**. ' +
      'Không trả số chính xác là có chủ đích: ba lần đo khoảng cách chính xác ' +
      'từ ba điểm khác nhau là dò ra được vị trí thật, vô hiệu hoá việc làm ' +
      'nhiễu toạ độ.',
  })
  distanceMeters: number;

  @ApiProperty({
    description:
      'Luôn `true` ở bảng tin công khai — toạ độ trả về đã bị làm nhiễu quanh ' +
      'vị trí thật. Toạ độ thật chỉ lộ cho người đã được người tặng duyệt.',
  })
  isLocationApproximate: boolean;
}

export class GetNearbyGiftPostsResponseDto implements IGetNearbyGiftPostsResponseDto {
  @ApiProperty({
    type: () => [NearbyGiftPostDto],
    description: 'Sắp xếp theo khoảng cách, gần trước xa sau.',
  })
  giftPosts: INearbyGiftPostDto[];

  @ApiProperty({
    type: () => PaginationMetaDto,
    description:
      'Thông tin phân trang: trang hiện tại, tổng số, còn trang sau không.',
  })
  meta: PaginationMetaDto;
}
