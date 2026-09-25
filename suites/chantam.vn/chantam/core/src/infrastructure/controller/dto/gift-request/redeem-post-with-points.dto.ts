import { IRedeemPostWithPointsResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

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
