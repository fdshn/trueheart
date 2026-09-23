import {
  ReportReasons,
  ReportStatuses,
  ReportTargetTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IReportEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  PostgresAuditableEntity,
  PostgresBaseEntity,
  PostgresDistributedEntity,
} from '@chantam/service.persistency-lib';
import { ApiProperty } from '@nestjs/swagger';
import { Mixin } from 'ts-mixer';
import { Column, Entity, Index } from 'typeorm';

@Entity('reports')
@Index(['status', 'createdAt'])
@Index(['targetType', 'targetId', 'status'])
export class ReportEntity
  extends Mixin(
    PostgresBaseEntity,
    PostgresDistributedEntity,
    PostgresAuditableEntity,
  )
  implements IReportEntity
{
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'reporter_user_id', type: 'uuid' })
  reporterUserId: string;

  @ApiProperty({ enum: ReportTargetTypes })
  @Column({ name: 'target_type', type: 'enum', enum: ReportTargetTypes })
  targetType: ReportTargetTypes;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  @ApiProperty({ enum: ReportReasons })
  @Column({ type: 'enum', enum: ReportReasons })
  reason: ReportReasons;

  @ApiProperty()
  @Column({ type: 'varchar', length: 1000 })
  description: string;

  @ApiProperty({ type: [String] })
  @Column({ name: 'evidence_urls', type: 'jsonb', default: [] })
  evidenceUrls: string[];

  @ApiProperty({ enum: ReportStatuses })
  @Column({
    type: 'enum',
    enum: ReportStatuses,
    default: ReportStatuses.PENDING,
  })
  status: ReportStatuses;

  @ApiProperty({ format: 'uuid', nullable: true })
  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId: string | null;

  @ApiProperty({ nullable: true })
  @Column({
    name: 'review_note',
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  reviewNote: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;
}
