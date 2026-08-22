import { GiftPostCategories } from '@chantam.vn/chantam.core-lib/consts';
import { IGiftPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { IGeoPoint } from '@chantam/service.persistency-lib/geo';
import { Repository } from 'typeorm';

export interface IFindNearbyParams {
  origin: IGeoPoint;
  radiusMeters: number;
  category?: GiftPostCategories;
  skip: number;
  take: number;
}

export interface INearbyGiftPost {
  giftPost: IGiftPostEntity;
  distanceMeters: number;
}

export interface IFindNearbyResult {
  items: INearbyGiftPost[];
  total: number;
}

/**
 * Cổng truy cập dữ liệu bài đăng.
 *
 * Kế thừa `Repository` của TypeORM để dùng lại toàn bộ API CRUD sẵn có, chỉ bổ
 * sung truy vấn không gian mà nghiệp vụ thực sự cần.
 */
export interface IGiftPostRepository extends Repository<IGiftPostEntity> {
  /** Tìm bài đăng trong bán kính, sắp xếp gần → xa. */
  findNearby(params: IFindNearbyParams): Promise<IFindNearbyResult>;
}

export const IGiftPostRepository = Symbol('IGiftPostRepository');
