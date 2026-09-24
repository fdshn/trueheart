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

  // Chỉ `createdAt`: trigger ở database chặn UPDATE và DELETE, nên `updatedAt`
  // sẽ là một cột không bao giờ đổi giá trị.
  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
