import {
  GiftTransactionStatusDto,
  IGiftTransactionDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  MaxPageSize,
  PaginationMetaDto,
} from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  GiftEvidenceItemDto,
  GiftTransactionDto,
} from '../transaction/transaction.dto';

const AdminTransactionStatuses: GiftTransactionStatusDto[] = [
  'ACCEPTED',
  'DELIVERING',
  'COMPLETED',
  'CANCELLED',
];

export class ReopenTransactionParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  transactionId: string;
}

export class ReopenTransactionDto {
  @ApiProperty({
    example: 'Hàng tới muộn, cron đóng nhầm',
    description: 'Bắt buộc — đây là quyết định sẽ bị hỏi lại.',
  })
  @Length(1, 500)
  reason: string;
}

export class ReopenTransactionBodyDto {
  @ApiProperty({ type: () => ReopenTransactionDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ReopenTransactionDto)
  reopen: ReopenTransactionDto;
}

export class ReopenTransactionResponseDto {
  @ApiProperty({ type: () => GiftTransactionDto })
  transaction: IGiftTransactionDto;
}

export class ListAdminTransactionsQueryDto {
  @ApiPropertyOptional({ enum: AdminTransactionStatuses })
  @IsOptional()
  @IsIn(AdminTransactionStatuses)
  status?: GiftTransactionStatusDto;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Khớp người tặng HOẶC người nhận.',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  postId?: string;

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

export class AdminTransactionDto extends GiftTransactionDto {
  @ApiProperty() postTitle: string;
  @ApiProperty() giverUsername: string;
  @ApiProperty() receiverUsername: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt: Date | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Lý do huỷ người đóng đã nhập.',
  })
  closeReason: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Người bấm đóng; `null` khi lượt chưa đóng.',
  })
  closedBy: string | null;
}

export class ListAdminTransactionsResponseDto {
  @ApiProperty({
    type: () => [AdminTransactionDto],
    description: 'Mới xin trước.',
  })
  transactions: AdminTransactionDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}

/** Cùng hình dạng với ảnh mà hai bên trong cuộc thấy ở `GET /transactions/:id`. */
export class AdminTransactionEvidenceDto extends GiftEvidenceItemDto {}

export class GetAdminTransactionResponseDto {
  @ApiProperty({ type: () => AdminTransactionDto })
  transaction: AdminTransactionDto;

  @ApiProperty({
    type: () => [AdminTransactionEvidenceDto],
    description: 'Ảnh bàn giao / nhận / hàng quay về, theo mốc rồi theo slot.',
  })
  evidence: AdminTransactionEvidenceDto[];
}
