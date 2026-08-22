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
  @ApiProperty({ example: 10.7724 })
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: 106.698 })
  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @ApiProperty({
    example: 5_000,
    maximum: MaxSearchRadiusMeters,
    description: 'Bán kính tìm kiếm tính bằng mét',
  })
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(MaxSearchRadiusMeters)
  radiusMeters: number;

  @ApiPropertyOptional({ enum: GiftPostCategories })
  @IsOptional()
  @IsEnum(GiftPostCategories)
  category?: GiftPostCategories;
}

export class NearbyGiftPostDto implements INearbyGiftPostDto {
  @ApiProperty({ type: () => GiftPostEntity })
  giftPost: IGiftPostEntity;

  @ApiProperty({
    example: 432,
    description: 'Khoảng cách tới điểm truy vấn (mét)',
  })
  distanceMeters: number;

  @ApiProperty({
    description: 'Luôn true — bảng tin công khai không trả toạ độ thật',
  })
  isLocationApproximate: boolean;
}

export class GetNearbyGiftPostsResponseDto implements IGetNearbyGiftPostsResponseDto {
  @ApiProperty({ type: () => [NearbyGiftPostDto] })
  giftPosts: INearbyGiftPostDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}
