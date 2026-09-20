import { GiftRequestStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { IAcceptGiftRequestResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AcceptGiftRequestParamDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Định danh canonical post.',
  })
  @IsUUID()
  postId: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Định danh yêu cầu xin nhận đồ được chọn duyệt.',
  })
  @IsUUID()
  requestId: string;
}

export class AcceptGiftRequestResponseDto implements IAcceptGiftRequestResponseDto {
  @ApiProperty({ format: 'uuid', description: 'ID yêu cầu được duyệt' })
  requestId: string;

  @ApiProperty({ format: 'uuid', description: 'ID bài đăng' })
  postId: string;

  @ApiProperty({
    enum: GiftRequestStatuses,
    description: 'Trạng thái yêu cầu (ACCEPTED)',
  })
  status: GiftRequestStatuses;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Mã giao dịch được sinh ra để mở phòng chat',
  })
  transactionId?: string;
}
