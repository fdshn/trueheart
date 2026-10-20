import {
  IGetGiftTransactionResult,
  IGiftEvidenceItem,
} from '@/application/contracts/transaction';
import { GiftEvidenceKinds } from '@chantam.vn/chantam.core-lib/consts';
import {
  GiftTransactionStatusDto,
  ICancelGiftTransactionBodyDto,
  ICancelGiftTransactionDto,
  IGiftTransactionDto,
  IGiftTransactionResponseDto,
  IListGiftTransactionsResponseDto,
  IRequestGiftBodyDto,
  IRequestGiftDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const TransactionStatuses: GiftTransactionStatusDto[] = [
  'ACCEPTED',
  'DELIVERING',
  'COMPLETED',
  'CANCELLED',
];

export class GiftTransactionParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  transactionId: string;
}

export class RequestGiftDto implements IRequestGiftDto {
  @ApiProperty({ format: 'uuid', description: 'Bài đăng muốn xin.' })
  @IsUUID()
  postId: string;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Số suất muốn xin; mặc định 1.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quantity?: number;
}

export class RequestGiftBodyDto implements IRequestGiftBodyDto {
  @ApiProperty({ type: () => RequestGiftDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => RequestGiftDto)
  giftRequest: IRequestGiftDto;
}

export class CancelGiftTransactionDto implements ICancelGiftTransactionDto {
  @ApiProperty({
    example: 'Không sắp xếp được thời gian nhận',
    description: 'Bắt buộc, để phía còn lại biết vì sao lượt trao bị huỷ.',
  })
  @IsString()
  @Length(1, 200)
  reason: string;
}

export class CancelGiftTransactionBodyDto implements ICancelGiftTransactionBodyDto {
  @ApiProperty({ type: () => CancelGiftTransactionDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CancelGiftTransactionDto)
  cancellation: ICancelGiftTransactionDto;
}

export class GiftTransactionDto implements IGiftTransactionDto {
  @ApiProperty({ format: 'uuid' }) transactionId: string;

  @ApiProperty({ format: 'uuid' }) postId: string;

  @ApiProperty({ format: 'uuid' }) giverId: string;

  @ApiProperty({ format: 'uuid' }) receiverId: string;

  @ApiProperty({ example: 1 }) quantity: number;

  @ApiProperty({ enum: TransactionStatuses })
  status: GiftTransactionStatusDto;

  @ApiProperty({ type: String, format: 'date-time' }) requestedAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  acceptedAt: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Mốc người tặng báo đã trao đồ — gửi đi, hoặc trao tận tay. Đồng hồ tự hoàn tất đếm từ mốc này nếu có, không thì đếm từ `acceptedAt`.',
  })
  handedOverAt: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Mốc hoàn tất; đây là thứ bộ đếm hoạt động của rank đọc.',
  })
  completedAt: Date | null;
}

export class GiftTransactionResponseDto implements IGiftTransactionResponseDto {
  @ApiProperty({ type: () => GiftTransactionDto })
  transaction: IGiftTransactionDto;
}

export class GiftEvidenceItemDto implements IGiftEvidenceItem {
  @ApiProperty({ enum: GiftEvidenceKinds }) kind: GiftEvidenceKinds;
  @ApiProperty({ minimum: 1, maximum: 3 }) slot: number;

  @ApiProperty({
    description:
      'URL công khai (`storage.publicBaseUrl` + key) — cùng kiểu URL ảnh bài đăng. Bucket là công khai, nên đây KHÔNG phải URL ký có hạn.',
  })
  url: string;

  @ApiProperty({ format: 'uuid', description: 'Người tải ảnh lên.' })
  uploadedBy: string;

  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}

export class GetGiftTransactionResponseDto implements IGetGiftTransactionResult {
  @ApiProperty({ type: () => GiftTransactionDto })
  transaction: IGiftTransactionDto;

  @ApiProperty({
    type: () => [GiftEvidenceItemDto],
    description:
      'Ảnh bằng chứng của CẢ HAI bên, theo mốc rồi theo slot: `HANDOVER` (người tặng lúc trao), `RECEIPT` (người nhận lúc nhận), `RETURNED` (người tặng lúc báo hàng quay về). Rỗng khi chưa ai chụp.',
  })
  evidence: IGiftEvidenceItem[];
}

export class ListGiftTransactionsResponseDto implements IListGiftTransactionsResponseDto {
  @ApiProperty({ type: () => [GiftTransactionDto] })
  transactions: IGiftTransactionDto[];
}
