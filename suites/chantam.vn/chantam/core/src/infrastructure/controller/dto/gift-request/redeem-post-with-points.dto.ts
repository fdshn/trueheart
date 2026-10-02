import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  IRedeemPostWithPointsResponseDto,
  IRedemptionQuoteDto,
  IRedemptionQuoteResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RedemptionQuoteDto implements IRedemptionQuoteDto {
  @ApiProperty({
    example: 500,
    description:
      'Giá bằng điểm, đã làm tròn LÊN. `0` khi chưa quy ra điểm được. Client PHẢI đọc con số này chứ không tự chia: tỷ lệ là cấu hình động, và làm tròn xuống ở client là hiện thiếu điểm so với số sẽ bị trừ.',
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

  @ApiProperty({ example: 0, description: 'Còn thiếu bao nhiêu điểm.' })
  missingPoints: number;

  @ApiProperty({
    description:
      '`true` khi trả số điểm này sẽ làm bạn TỤT HẠNG — mất quota bài và các quyền ' +
      'của bậc đang giữ. Hạng đọc `balancePoints` và tiêu điểm giảm đúng con số đó, ' +
      'nên cảnh báo này luôn có nghĩa.',
  })
  wouldDemote: boolean;

  @ApiProperty({
    enum: UserRanks,
    description: 'Hạng sau khi đổi. Bằng hạng hiện tại khi không tụt.',
  })
  rankAfter: UserRanks;
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
