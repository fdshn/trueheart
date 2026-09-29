import {
  IGetTransactionReviewsResponseDto,
  ISubmitReviewBodyDto,
  ISubmitReviewDto,
  ISubmitReviewResponseDto,
  ITransactionReviewDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  MaxReviewCommentLength,
  TransactionReviewRoles,
} from '@chantam.vn/chantam.core-lib/models';
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

export class TransactionReviewParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  transactionId: string;
}

export class SubmitReviewDto implements ISubmitReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, description: 'Trải nghiệm chung.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 100,
    description:
      'Mức chính xác của mô tả so với hàng thật. BẮT BUỘC khi bạn là bên NHẬN, và phải bỏ trống khi bạn là bên TẶNG.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  accuracyPercent?: number;

  @ApiPropertyOptional({ maxLength: MaxReviewCommentLength })
  @IsOptional()
  @IsString()
  @Length(1, MaxReviewCommentLength)
  comment?: string;
}

export class SubmitReviewBodyDto implements ISubmitReviewBodyDto {
  @ApiProperty({ type: () => SubmitReviewDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SubmitReviewDto)
  review: SubmitReviewDto;
}

export class TransactionReviewDto implements ITransactionReviewDto {
  @ApiProperty({ format: 'uuid' }) reviewId: string;
  @ApiProperty({ format: 'uuid' }) transactionId: string;
  @ApiProperty({ format: 'uuid' }) reviewerId: string;
  @ApiProperty({ format: 'uuid' }) revieweeId: string;

  @ApiProperty({ enum: TransactionReviewRoles })
  reviewerRole: TransactionReviewRoles;

  @ApiProperty({ minimum: 1, maximum: 5 }) rating: number;

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: 100 })
  accuracyPercent: number | null;

  @ApiPropertyOptional({ nullable: true }) comment: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}

export class SubmitReviewResponseDto implements ISubmitReviewResponseDto {
  @ApiProperty({ type: () => TransactionReviewDto })
  review: ITransactionReviewDto;
}

export class GetTransactionReviewsResponseDto implements IGetTransactionReviewsResponseDto {
  @ApiPropertyOptional({
    type: () => TransactionReviewDto,
    nullable: true,
    description: 'Đánh giá của chính bạn. `null` khi chưa gửi.',
  })
  mine: ITransactionReviewDto | null;

  @ApiPropertyOptional({
    type: () => TransactionReviewDto,
    nullable: true,
    description:
      'Đánh giá của bên kia. Chỉ hiện SAU khi bạn đã gửi của mình — đọc trước rồi mới chấm là mời nhau trả đũa.',
  })
  counterpart: ITransactionReviewDto | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 90,
    description:
      'Mức chính xác bên kia đã chấm. Người TẶNG thấy ngay cả khi chưa gửi đánh giá của mình: đây là hệ số tính thưởng của họ (56 × mức này), không phải một ý kiến về họ — và `reason` của bút toán trong `GET /points/me/ledger` vốn đã ghi thẳng con số đó. Bình luận và điểm sao thì vẫn kín cho tới khi cả hai đã gửi.',
  })
  counterpartAccuracyPercent: number | null;
}
