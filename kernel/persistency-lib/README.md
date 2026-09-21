# `@chantam/service.persistency-lib`

Entity cơ sở, kết nối PostgreSQL và **tiện ích truy vấn không gian PostGIS** — phần hạ tầng
gắn trực tiếp với nghiệp vụ lõi "ưu tiên cự ly gần" của Chân Tâm.

## Export chính

| Đường dẫn import | Nội dung |
| --- | --- |
| `@chantam/service.persistency-lib` | Toàn bộ (entity + geo + persistence) |
| `.../entities` | `PostgresBaseEntity`, `PostgresDistributedEntity`, `PostgresAuditableEntity`, `PostgresSoftDeletableEntity` |
| `.../geo` | `GeoColumn`, `GeoQueryHelper`, `applyGeoJitter`, `IGeoPoint` |
| `.../persistence` | `PersistencyModule`, `Repositories` |

## Entity cơ sở

Trộn bằng `Mixin()` của ts-mixer:

```typescript
@Entity('gift_posts')
export class GiftPostEntity
  extends Mixin(
    PostgresBaseEntity,          // id: number — @Exclude(), không lộ ra API
    PostgresDistributedEntity,   // globalId: uuid — danh tính công khai
    PostgresAuditableEntity,     // createdAt / updatedAt (timestamptz)
    PostgresSoftDeletableEntity, // deletedAt
  )
  implements IGiftPostEntity {}
```

`PostgresSoftDeletableEntity` cố ý **không** dùng `@DeleteDateColumn` — bản ghi đã xoá mềm
vẫn phải resolve được từ lịch sử giao dịch tham chiếu tới nó. Hệ quả: `softDelete()` và
`withDeleted()` không dùng được; tự gán `deletedAt` và tự lọc.

## PostGIS

### Khai báo cột

```typescript
@GeoColumn()
location: IGeoPoint;
```

Sinh ra `geography(Point, 4326)` kèm index GiST và transformer đổi giữa `{lat, lng}` của
domain và GeoJSON `[lng, lat]` của PostGIS. **Không tự viết `@Column({ type: 'geography' })`**
— rất dễ quên index, và thiếu index thì `ST_DWithin` quét toàn bảng.

### Truy vấn

```typescript
const queryBuilder = this.createQueryBuilder('post');

GeoQueryHelper.applyRadiusFilter(queryBuilder, 'post', {
  lat, lng, radiusMeters,             // giới hạn 100m–MaxSearchRadiusMeters = 50km
});
GeoQueryHelper.selectDistance(queryBuilder, 'post', { lat, lng }, 'distance_meters');
GeoQueryHelper.orderByDistance(queryBuilder, 'post', { lat, lng });

const { entities, raw } = await queryBuilder.getRawAndEntities();
```

Khoảng cách nằm ở `raw`, không phải trên entity — vì nó là giá trị tính theo truy vấn, không
phải thuộc tính của bản ghi.

Chế độ xem bản đồ dùng `applyBoundingBox()` (khung nhìn là hình chữ nhật) thay cho bán kính.

> Không bao giờ tính khoảng cách bằng Haversine trong TypeScript — làm vậy buộc phải nạp
> toàn bộ bảng lên rồi mới lọc.

### Làm nhiễu toạ độ

```typescript
const publicLocation = applyGeoJitter(post.location, post.globalId);
```

Đặc tả SRS v1.15.0 (Mục 1.3 & UI-ITEM-DETAIL-01) yêu cầu chỉ người được duyệt nhận mới biết địa chỉ chính xác. Nhiễu **tất
định theo `globalId`**: nếu nhiễu ngẫu nhiên mỗi lần gọi, kẻ tấn công gọi API nhiều lần rồi
lấy tâm cụm điểm là suy ra vị trí thật.

## Kết nối database

```typescript
@Module({
  imports: [
    PersistencyModule.forPostgresAsync({
      inject: [IConfig],
      entities,                                   // import * as entities from '../entity'
      useFactory: (config: IConfig) => config.database.default,
      synchronize: config.env === 'development',
    }),
  ],
})
export class PersistenceModule {}
```

`synchronize` chỉ được bật ở development. Production dùng migration.
