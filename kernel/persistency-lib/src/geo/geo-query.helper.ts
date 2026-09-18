import { SelectQueryBuilder } from 'typeorm';
import { IGeoPoint, Srid } from './geo-point';

export interface IRadiusFilter extends IGeoPoint {
  radiusMeters: number;
}

export interface IBoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Bán kính tìm kiếm tối thiểu để tránh truy vấn vị trí quá chi tiết. */
export const MinSearchRadiusMeters = 100;

/** Bán kính tìm kiếm tối đa. Chặn truy vấn quét cả nước làm sập database. */
export const MaxSearchRadiusMeters = 50_000;

/**
 * Tiện ích dựng mệnh đề truy vấn không gian.
 *
 * Không bao giờ tự tính khoảng cách bằng công thức Haversine trong TypeScript:
 * làm vậy buộc phải nạp toàn bộ bảng lên rồi mới lọc. `ST_DWithin` dùng được
 * index GiST nên chỉ chạm vào các bản ghi thực sự nằm gần.
 */
export class GeoQueryHelper {
  /** Biểu thức PostGIS cho một điểm gốc, kèm tham số đã đặt tên duy nhất. */
  private static originExpression(paramPrefix: string): string {
    return `ST_SetSRID(ST_MakePoint(:${paramPrefix}Lng, :${paramPrefix}Lat), ${Srid})::geography`;
  }

  /**
   * Giới hạn kết quả trong bán kính cho trước.
   *
   * @param column tên cột trong database (không phải tên thuộc tính entity)
   */
  public static applyRadiusFilter<Entity extends object>(
    queryBuilder: SelectQueryBuilder<Entity>,
    alias: string,
    filter: IRadiusFilter,
    column = 'location',
    paramPrefix = 'geoRadius',
  ): SelectQueryBuilder<Entity> {
    const radiusMeters = Math.min(
      Math.max(0, filter.radiusMeters),
      MaxSearchRadiusMeters,
    );

    return queryBuilder.andWhere(
      `ST_DWithin(${alias}.${column}, ${this.originExpression(paramPrefix)}, :${paramPrefix}Meters)`,
      {
        [`${paramPrefix}Lat`]: filter.lat,
        [`${paramPrefix}Lng`]: filter.lng,
        [`${paramPrefix}Meters`]: radiusMeters,
      },
    );
  }

  /**
   * Bổ sung một cột khoảng cách (mét) vào kết quả thô.
   *
   * Giá trị nằm ở `raw`, không phải trên entity — đọc bằng `getRawAndEntities()`.
   */
  public static selectDistance<Entity extends object>(
    queryBuilder: SelectQueryBuilder<Entity>,
    alias: string,
    origin: IGeoPoint,
    outputAlias = 'distance_meters',
    column = 'location',
    paramPrefix = 'geoDistance',
  ): SelectQueryBuilder<Entity> {
    return queryBuilder
      .addSelect(
        `ST_Distance(${alias}.${column}, ${this.originExpression(paramPrefix)})`,
        outputAlias,
      )
      .setParameters({
        [`${paramPrefix}Lat`]: origin.lat,
        [`${paramPrefix}Lng`]: origin.lng,
      });
  }

  /** Sắp xếp gần → xa. Nghiệp vụ lõi của Chân Tâm (mục 1.1 đặc tả). */
  public static orderByDistance<Entity extends object>(
    queryBuilder: SelectQueryBuilder<Entity>,
    alias: string,
    origin: IGeoPoint,
    column = 'location',
    paramPrefix = 'geoOrder',
  ): SelectQueryBuilder<Entity> {
    return queryBuilder
      .addOrderBy(
        `ST_Distance(${alias}.${column}, ${this.originExpression(paramPrefix)})`,
        'ASC',
      )
      .setParameters({
        [`${paramPrefix}Lat`]: origin.lat,
        [`${paramPrefix}Lng`]: origin.lng,
      });
  }

  /**
   * Lọc theo khung nhìn bản đồ.
   *
   * Dùng cho chế độ xem bản đồ (mục 5.5 đặc tả) khi người dùng kéo hoặc phóng
   * to — khung nhìn là hình chữ nhật, không phải hình tròn.
   */
  public static applyBoundingBox<Entity extends object>(
    queryBuilder: SelectQueryBuilder<Entity>,
    alias: string,
    box: IBoundingBox,
    column = 'location',
    paramPrefix = 'geoBox',
  ): SelectQueryBuilder<Entity> {
    return queryBuilder.andWhere(
      `ST_Intersects(${alias}.${column}, ST_MakeEnvelope(:${paramPrefix}MinLng, :${paramPrefix}MinLat, :${paramPrefix}MaxLng, :${paramPrefix}MaxLat, ${Srid})::geography)`,
      {
        [`${paramPrefix}MinLng`]: box.minLng,
        [`${paramPrefix}MinLat`]: box.minLat,
        [`${paramPrefix}MaxLng`]: box.maxLng,
        [`${paramPrefix}MaxLat`]: box.maxLat,
      },
    );
  }
}
