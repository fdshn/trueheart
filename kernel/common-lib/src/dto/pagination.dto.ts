import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { decorate } from 'ts-mixer';

/** Số bản ghi tối đa cho một trang. Giữ nhỏ vì đối tượng dùng máy cấu hình thấp. */
export const MaxPageSize = 50;
export const DefaultPageSize = 20;

export interface IPaginationQueryDto {
  page?: number;
  pageSize?: number;
}

export interface IPaginationMetaDto {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Dùng `decorate()` của ts-mixer thay vì decorator thường vì class này thường
 * được trộn (Mixin) vào các query DTO cụ thể.
 */
export class PaginationQueryDto implements IPaginationQueryDto {
  @decorate(
    ApiPropertyOptional({
      minimum: 1,
      default: 1,
      description: 'Trang muốn lấy, đếm từ 1.',
    }),
  )
  @decorate(IsOptional())
  @decorate(Type(() => Number))
  @decorate(IsInt())
  @decorate(Min(1))
  page?: number = 1;

  @decorate(
    ApiPropertyOptional({
      minimum: 1,
      maximum: MaxPageSize,
      default: DefaultPageSize,
      description:
        `Số bản ghi mỗi trang (tối đa ${MaxPageSize}). Giữ trần nhỏ vì người ` +
        'dùng chủ yếu chạy máy cấu hình thấp và mạng yếu.',
    }),
  )
  @decorate(IsOptional())
  @decorate(Type(() => Number))
  @decorate(IsInt())
  @decorate(Min(1))
  @decorate(Max(MaxPageSize))
  pageSize?: number = DefaultPageSize;
}

export class PaginationMetaDto implements IPaginationMetaDto {
  @ApiProperty({ example: 1, description: 'Trang hiện tại.' })
  page: number;

  @ApiProperty({ example: 20, description: 'Số bản ghi mỗi trang.' })
  pageSize: number;

  @ApiProperty({
    example: 137,
    description: 'Tổng số bản ghi khớp điều kiện lọc.',
  })
  total: number;

  @ApiProperty({ example: 7, description: 'Tổng số trang.' })
  totalPages: number;

  @ApiProperty({ description: 'Còn trang sau không.' })
  hasNextPage: boolean;

  @ApiProperty({ description: 'Còn trang trước không.' })
  hasPreviousPage: boolean;

  public constructor(page: number, pageSize: number, total: number) {
    this.page = page;
    this.pageSize = pageSize;
    this.total = total;
    this.totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
    this.hasNextPage = page < this.totalPages;
    this.hasPreviousPage = page > 1;
  }
}

/** Chuyển page/pageSize thành cặp skip/take cho TypeORM. */
export function toSkipTake(query: IPaginationQueryDto): {
  skip: number;
  take: number;
} {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(
    MaxPageSize,
    Math.max(1, query.pageSize ?? DefaultPageSize),
  );

  return { skip: (page - 1) * pageSize, take: pageSize };
}
