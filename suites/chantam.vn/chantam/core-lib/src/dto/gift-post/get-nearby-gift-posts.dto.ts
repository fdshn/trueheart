import {
  IPaginationMetaDto,
  IPaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import { GiftPostCategories } from '../../consts';
import { IGiftPostEntity } from '../../entities';

export interface IGetNearbyGiftPostsQueryDto extends IPaginationQueryDto {
  lat: number;
  lng: number;
  /** Bán kính tìm kiếm (mét). Bị chặn trần 50km ở tầng truy vấn. */
  radiusMeters: number;
  category?: GiftPostCategories;
}

export interface INearbyGiftPostDto {
  giftPost: IGiftPostEntity;
  /** Khoảng cách tính bởi PostGIS, làm tròn tới mét. */
  distanceMeters: number;
  isLocationApproximate: boolean;
}

export interface IGetNearbyGiftPostsResponseDto {
  giftPosts: INearbyGiftPostDto[];
  meta: IPaginationMetaDto;
}
