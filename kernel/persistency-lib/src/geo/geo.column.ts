import { applyDecorators } from '@nestjs/common';
import { Column, Index } from 'typeorm';
import { Srid } from './geo-point';
import { GeoPointTransformer } from './geo-point.transformer';

export interface IGeoColumnOptions {
  /** Tên cột trong database. Mặc định `location`. */
  name?: string;
  nullable?: boolean;
  /** Số chữ số thập phân tối đa khi TypeORM đọc GeoJSON từ PostgreSQL. */
  precision?: number;
  /** Tạo index GiST. Mặc định `true` — không có index thì ST_DWithin quét toàn bảng. */
  index?: boolean;
}

/**
 * Khai báo một cột toạ độ.
 *
 * Luôn dùng decorator này thay vì tự viết `@Column({ type: 'geography' })` để
 * mọi entity có cùng SRID, cùng transformer và không bao giờ quên index GiST.
 *
 * @example
 * ```typescript
 * @GeoColumn()
 * location: IGeoPoint;
 * ```
 */
export function GeoColumn(options: IGeoColumnOptions = {}): PropertyDecorator {
  const {
    name = 'location',
    nullable = false,
    precision,
    index = true,
  } = options;

  const decorators: PropertyDecorator[] = [
    Column({
      type: 'geography',
      spatialFeatureType: 'Point',
      srid: Srid,
      name,
      nullable,
      precision,
      transformer: GeoPointTransformer,
    }),
  ];

  if (index) decorators.push(Index({ spatial: true }));

  return applyDecorators(...decorators);
}
