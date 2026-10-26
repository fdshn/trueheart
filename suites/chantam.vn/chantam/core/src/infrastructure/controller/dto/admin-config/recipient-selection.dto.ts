import {
  CandidateSelectionCriteria,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IAdminRecipientSelectionDetailDto,
  IAdminRecipientSelectionItemDto,
  IGetAdminRecipientSelectionResponseDto,
  IGetTransactionSelectionReasonResponseDto,
  IListAdminRecipientSelectionsQueryDto,
  IListAdminRecipientSelectionsResponseDto,
  IRecipientSelectionCandidateDto,
  ITransactionSelectionReasonDto,
  RecipientSelectionTrigger,
} from '@chantam.vn/chantam.core-lib/dto';
import { CandidateSelectionReason } from '@chantam.vn/chantam.core-lib/models';
import {
  MaxPageSize,
  PaginationMetaDto,
} from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/** Mọi giá trị `decidingCriterion` có thể có — năm tiêu chí và hai lý do đặc biệt. */
export const CandidateSelectionReasonValues: readonly CandidateSelectionReason[] =
  [
    ...Object.values(CandidateSelectionCriteria),
    'REQUEST_ORDER',
    'ONLY_CANDIDATE',
  ];

const ReasonDescription =
  'Tiêu chí ĐẦU TIÊN tách người được chọn khỏi người về nhì. `REQUEST_ORDER`: ngang nhau mọi tiêu chí, xét theo thứ tự gửi yêu cầu. `ONLY_CANDIDATE`: chỉ có một người xin.';

export class ListAdminRecipientSelectionsQueryDto implements IListAdminRecipientSelectionsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  postId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Khớp người được chọn HOẶC chủ bài.',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ enum: CandidateSelectionReasonValues })
  @IsOptional()
  @IsIn(CandidateSelectionReasonValues)
  decidingCriterion?: CandidateSelectionReason;

  @ApiPropertyOptional({
    example: '2026-10-01T00:00:00+07:00',
    description: 'Chọn từ thời điểm này (gồm).',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-01T00:00:00+07:00',
    description: 'Chọn trước thời điểm này (không gồm).',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: MaxPageSize, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MaxPageSize)
  pageSize?: number;
}

export class AdminRecipientSelectionParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  transactionId: string;
}

export class RecipientSelectionCandidateDto implements IRecipientSelectionCandidateDto {
  @ApiProperty({ format: 'uuid' }) requesterId: string;
  @ApiProperty({ type: String, nullable: true }) username: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  requestId: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  queueJoinedAt: string | null;
  @ApiProperty({ enum: UserRanks, nullable: true }) rank: UserRanks | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: '`null` khi chưa đặt Vị trí mặc định.',
  })
  distanceMeters: number | null;
  @ApiProperty({ type: Number, nullable: true }) receivedCount: number | null;
  @ApiProperty({ type: Number, nullable: true })
  cancellationCount: number | null;
}

export class AdminRecipientSelectionItemDto implements IAdminRecipientSelectionItemDto {
  @ApiProperty({ format: 'uuid' }) transactionId: string;
  @ApiProperty({ format: 'uuid' }) postId: string;
  @ApiProperty({ type: String, nullable: true }) postTitle: string | null;
  @ApiProperty({ format: 'uuid', description: 'Người được chọn.' })
  requesterId: string;
  @ApiProperty({ type: String, nullable: true })
  requesterUsername: string | null;
  @ApiProperty({
    enum: CandidateSelectionReasonValues,
    description: ReasonDescription,
  })
  decidingCriterion: CandidateSelectionReason;
  @ApiProperty({ example: 'Ở gần điểm hẹn nhất trong các ứng viên' })
  reasonLabel: string;
  @ApiProperty() candidateCount: number;
  @ApiProperty({
    example: 'ACCEPTED',
    description: 'Trạng thái HIỆN TẠI của lượt trao.',
  })
  transactionStatus: string;
  @ApiProperty({ format: 'date-time' }) selectedAt: string;
}

export class SelectionCriterionDto {
  @ApiProperty({ enum: CandidateSelectionCriteria })
  criterion: CandidateSelectionCriteria;
  @ApiProperty({ example: 'Gần điểm hẹn nhất' }) label: string;
}

export class AdminRecipientSelectionDetailDto
  extends AdminRecipientSelectionItemDto
  implements IAdminRecipientSelectionDetailDto
{
  @ApiProperty({ enum: ['AUTOMATIC'] }) trigger: RecipientSelectionTrigger;

  @ApiProperty({
    type: () => [SelectionCriterionDto],
    description:
      'Thứ tự tiêu chí ĐÃ dùng lúc chọn (đã chuẩn hoá), không phải cấu hình hiện tại.',
  })
  criteriaOrder: SelectionCriterionDto[];

  @ApiProperty({
    type: () => RecipientSelectionCandidateDto,
    description: 'Số đo người được chọn TẠI LÚC chọn.',
  })
  winner: RecipientSelectionCandidateDto;

  @ApiProperty({
    type: () => RecipientSelectionCandidateDto,
    nullable: true,
    description: '`null` khi chỉ có một ứng viên.',
  })
  runnerUp: RecipientSelectionCandidateDto | null;

  @ApiProperty({ type: String, nullable: true }) postAuthorId: string | null;
  @ApiProperty({ type: String, nullable: true })
  postAuthorUsername: string | null;
}

export class ListAdminRecipientSelectionsResponseDto implements IListAdminRecipientSelectionsResponseDto {
  @ApiProperty({ type: () => [AdminRecipientSelectionItemDto] })
  selections: AdminRecipientSelectionItemDto[];
  @ApiProperty({ type: () => PaginationMetaDto }) meta: PaginationMetaDto;
}

export class GetAdminRecipientSelectionResponseDto implements IGetAdminRecipientSelectionResponseDto {
  @ApiProperty({
    type: () => AdminRecipientSelectionDetailDto,
    nullable: true,
    description: '`null` khi lượt trao có thật nhưng do chủ bài tự chọn.',
  })
  selection: AdminRecipientSelectionDetailDto | null;
}

export class TransactionSelectionReasonDto implements ITransactionSelectionReasonDto {
  @ApiProperty({ enum: ['AUTOMATIC'] }) trigger: RecipientSelectionTrigger;
  @ApiProperty({
    enum: CandidateSelectionReasonValues,
    description: ReasonDescription,
  })
  decidingCriterion: CandidateSelectionReason;
  @ApiProperty({
    example: 'Ở gần điểm hẹn nhất trong các ứng viên',
    description: 'Câu hiện thẳng cho người dùng.',
  })
  reasonLabel: string;
  @ApiProperty() candidateCount: number;
  @ApiProperty({ format: 'date-time' }) selectedAt: string;
}

export class GetTransactionSelectionReasonResponseDto implements IGetTransactionSelectionReasonResponseDto {
  @ApiProperty({
    type: () => TransactionSelectionReasonDto,
    nullable: true,
    description: '`null` khi chủ bài tự chọn người nhận.',
  })
  selection: TransactionSelectionReasonDto | null;
}
