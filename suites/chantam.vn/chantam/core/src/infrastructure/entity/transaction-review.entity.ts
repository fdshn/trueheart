import { ITransactionReviewEntity } from '@chantam.vn/chantam.core-lib/entities';
import { TransactionReviewRoles } from '@chantam.vn/chantam.core-lib/models';
import {
  PostgresBaseEntity,
  PostgresDistributedEntity,
} from '@chantam/service.persistency-lib';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Mixin } from 'ts-mixer';
import { Column, CreateDateColumn, Entity, Index, Unique } from 'typeorm';

@Entity('transaction_reviews')
@Unique('UQ_transaction_reviews_one_per_reviewer', [
  'transactionId',
  'reviewerId',
])
@Index('IDX_transaction_reviews_reviewee', ['revieweeId', 'createdAt'])
export class TransactionReviewEntity
  extends Mixin(PostgresBaseEntity, PostgresDistributedEntity)
  implements ITransactionReviewEntity
{
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'reviewer_id', type: 'uuid' })
  reviewerId: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'reviewee_id', type: 'uuid' })
  revieweeId: string;

  @ApiProperty({ enum: TransactionReviewRoles })
  @Column({
    name: 'reviewer_role',
    type: 'enum',
    enum: TransactionReviewRoles,
  })
  reviewerRole: TransactionReviewRoles;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @Column({ type: 'smallint' })
  rating: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, nullable: true })
  @Column({ name: 'accuracy_percent', type: 'smallint', nullable: true })
  accuracyPercent: number | null;

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'varchar', length: 1000, nullable: true })
  comment: string | null;

  // Chỉ `createdAt`, không `updatedAt`: từ 11/10 hàng này sửa được đúng MỘT lần
  // (CHỐT-10 mục 4), và mốc của lần đó nằm ở `editedAt` — một cột mang đúng một
  // nghĩa. `updatedAt` sẽ nói "lần cuối đổi" cho một hàng chỉ đổi được một lần,
  // tức cùng thông tin dưới một cái tên mơ hồ hơn.
  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ApiPropertyOptional({ nullable: true })
  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt: Date | null;

  // Ba cột bản cũ do TRIGGER ghi, không phải tầng ứng dụng: xem
  // `1799700000000-AllowReviewEditOnce`. Khai ở đây để đọc được, chứ mọi lượt
  // ghi vào chúng đều bị trigger đè lại bằng giá trị thật của hàng trước khi sửa.
  @ApiPropertyOptional({ minimum: 1, maximum: 5, nullable: true })
  @Column({ name: 'previous_rating', type: 'smallint', nullable: true })
  previousRating: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, nullable: true })
  @Column({
    name: 'previous_accuracy_percent',
    type: 'smallint',
    nullable: true,
  })
  previousAccuracyPercent: number | null;

  @ApiPropertyOptional({ nullable: true })
  @Column({
    name: 'previous_comment',
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  previousComment: string | null;
}
