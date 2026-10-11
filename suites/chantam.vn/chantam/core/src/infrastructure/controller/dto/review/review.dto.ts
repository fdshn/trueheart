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

/**
 * Body của lượt SỬA đánh giá — cùng hình dạng với lượt gửi, có chủ ý.
 *
 * Một lần sửa là một bản đánh giá ĐẦY ĐỦ, không phải bản vá từng trường: nếu
 * trường bỏ trống nghĩa là "giữ nguyên" thì việc XOÁ bình luận không diễn đạt
 * được, và client không có cách nào nói điều đó.
 */
export class EditReviewBodyDto extends SubmitReviewBodyDto {}

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

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Lúc bạn sửa đánh giá này, `null` khi chưa sửa. Mỗi đánh giá sửa được ĐÚNG một lần (CHỐT-10 mục 4), ' +
      'nên `null` cộng với `myEditableUntil` còn ở tương lai là điều kiện hiện nút Sửa. ' +
      'Bản trước lần sửa được giữ ở database cho đối soát, không trả ra API — nó là dấu vết, không phải nội dung của ai.',
  })
  editedAt: Date | null;
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

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Hạn sửa đánh giá CỦA BẠN: `completed_at + review.grace.graceDays` (CHỐT-10 mục 4). `null` khi lượt trao chưa hoàn tất. ' +
      'Trả về chứ không để client tự tính — số ngày là cấu hình động Admin đổi được. ' +
      'Đây cũng đúng là mốc chốt `value_bonus` của người tặng: sau mốc này bản đánh giá cuối được dùng để tính thưởng, nên không còn sửa được.',
  })
  myEditableUntil: Date | null;
}
