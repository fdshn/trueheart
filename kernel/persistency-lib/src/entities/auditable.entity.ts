import { ApiProperty } from '@nestjs/swagger';
import { decorate } from 'ts-mixer';
import { CreateDateColumn, Index, UpdateDateColumn } from 'typeorm';

export interface IAuditableEntity {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Luôn dùng `timestamptz`. Người dùng ở nhiều múi giờ (đặc tả nhắm cả cộng đồng
 * Phật tử ngoài Việt Nam) và lịch âm được tính phía client, nên server phải giữ
 * mốc thời gian tuyệt đối.
 */
export abstract class PostgresAuditableEntity implements IAuditableEntity {
  // Kiểu phải khai báo tường minh: ts-mixer bọc decorator nên metadata
  // `design:type` không đến được Swagger, và Swagger hiểu nhầm thành phụ thuộc vòng.
  @decorate(ApiProperty({ type: String, format: 'date-time' }))
  @decorate(Index())
  @decorate(
    CreateDateColumn({
      type: 'timestamptz',
      name: 'created_at',
      nullable: false,
    }),
  )
  createdAt: Date;

  @decorate(ApiProperty({ type: String, format: 'date-time' }))
  @decorate(Index())
  @decorate(
    UpdateDateColumn({
      type: 'timestamptz',
      name: 'updated_at',
      nullable: false,
    }),
  )
  updatedAt: Date;
}
