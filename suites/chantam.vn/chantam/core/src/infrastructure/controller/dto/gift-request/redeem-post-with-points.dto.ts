import {
  IRedeemPostWithPointsResponseDto,
  IRedemptionQuoteDto,
  IRedemptionQuoteResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class RedemptionQuoteDto implements IRedemptionQuoteDto {
  @ApiProperty({
    example: 500,
    description:
      'Giá bằng điểm, đã làm tròn NỬA-LÊN — phần lẻ từ 0,5 trở lên thì lên, dưới 0,5 thì xuống (SRS CHỐT-13). `0` khi chưa quy ra điểm được, và một món rẻ tới mức ra 0 điểm thì KHÔNG đổi được. Client PHẢI đọc con số này chứ không tự chia: tỷ lệ là cấu hình động, và làm tròn khác ở client là hiện một giá khác với số sẽ bị trừ.',
  })
  points: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 1000000,
    description: 'Giá trị tham khảo người tặng khai. `null` khi bỏ trống.',
  })
  estimatedValueVnd: number | null;

  @ApiProperty({
    example: 2000,
    description:
      'Tỷ lệ đang áp. Trả kèm để client giải thích được con số cho người dùng, không phải để client tự tính lại.',
  })
  vndPerPoint: number;

  @ApiProperty({ description: '`false` khi bài chưa quy ra điểm được.' })
  redeemable: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['NOT_AVAILABLE', 'NO_ESTIMATED_VALUE', 'INSUFFICIENT_POINTS'],
    description:
      'Vì sao chưa đổi được; `null` khi đổi được ngay. `NOT_AVAILABLE` gộp "đồng hồ không chạy", "bài không tồn tại" và "bạn chưa gửi yêu cầu xin" — cùng cách gộp như đường bấm thật, vì phân biệt chúng là để lộ bài nào tồn tại cho người chưa từng thấy nó.',
  })
  unavailableReason:
    'NOT_AVAILABLE' | 'NO_ESTIMATED_VALUE' | 'INSUFFICIENT_POINTS' | null;

  @ApiProperty({ example: 700, description: 'Điểm đang có của bạn.' })
  balancePoints: number;

  @ApiProperty({
    example: 896,
    description:
      'Phần điểm GIỮ LẠI để không tụt hạng — bằng ngưỡng của bậc đang giữ ' +
      '(CHỐT-13). Hiện cả hai con số cho người dùng: "bạn có 1.000 điểm, dùng ' +
      'được 104 — 896 điểm giữ hạng Vàng".',
  })
  reservedForRankPoints: number;

  @ApiProperty({
    example: 104,
    description:
      'Phần điểm thật sự tiêu được = max(0, balancePoints - reservedForRankPoints). ' +
      'Đây là con số `missingPoints` so với, KHÔNG phải `balancePoints`.',
  })
  availablePoints: number;

  @ApiProperty({
    example: 0,
    description: 'Còn thiếu bao nhiêu điểm so với `availablePoints`.',
  })
  missingPoints: number;
}

export class RedemptionQuoteResponseDto implements IRedemptionQuoteResponseDto {
  @ApiProperty({ type: () => RedemptionQuoteDto }) quote: IRedemptionQuoteDto;
}

export class RedeemPostWithPointsParamDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Định danh canonical post muốn đổi bằng điểm.',
  })
  @IsUUID()
  postId: string;
}

export class RedeemPostWithPointsBodyDto {
  @ApiProperty({
    example: 500,
    description:
      'Số điểm bạn ĐÃ THẤY ở `GET /posts/{postId}/redemption-quote` và đồng ý trả — chép nguyên trường `quote.points`, không tự tính. ' +
      'Lệch với giá máy chủ tính lại thì trả `409 REDEMPTION_QUOTE_STALE` kèm cả hai con số và KHÔNG trừ điểm: ' +
      'báo giá không giữ giá, nên chủ bài sửa giá trị tham khảo hoặc Admin đổi tỷ lệ là giá đổi ngay (CHỐT-10 mục 2). ' +
      'Bắt buộc gửi — một phép xác nhận bỏ qua được bằng cách không gửi trường nào thì không phải phép xác nhận.',
  })
  @IsInt()
  @Min(1)
  confirmedPoints: number;
}

export class RedeemPostWithPointsResponseDto implements IRedeemPostWithPointsResponseDto {
  @ApiProperty({ format: 'uuid', description: 'ID bài đăng đã chốt' })
  postId: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Lượt trao vừa mở, kèm phòng chat với người tặng',
  })
  transactionId: string;

  @ApiProperty({ example: 500, description: 'Số điểm đã trừ' })
  pointsSpent: number;

  @ApiProperty({
    example: 1292,
    description: 'Điểm TIÊU ĐƯỢC còn lại sau khi trừ',
  })
  balanceAfter: number;
}
