import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';

export class ReportShipUnpaidParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  transactionId: string;
}

export class ReportShipUnpaidDto {
  @ApiProperty({
    minLength: 10,
    maxLength: 500,
    example: 'Đơn bị hoàn về ngày 20/9, người nhận không thanh toán phí ship',
  })
  @IsString()
  @Length(10, 500)
  reason: string;
}

export class ReportShipUnpaidBodyDto {
  @ApiProperty({ type: () => ReportShipUnpaidDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ReportShipUnpaidDto)
  report: ReportShipUnpaidDto;
}

export class ReportShipUnpaidResponseDto {
  @ApiProperty({ format: 'uuid' })
  transactionId: string;

  @ApiProperty({ format: 'uuid' })
  penalizedUserId: string;

  @ApiProperty({
    example: -50,
    description: 'Số điểm bị trừ. Lấy từ point rule nên Admin chỉnh được.',
  })
  penaltyPoints: number;

  @ApiProperty({
    example: 0,
    description: 'Số tiêu được sau khi trừ, kẹp ở 0.',
  })
  balanceAfter: number;

  @ApiProperty({
    example: -30,
    description: 'Giá trị THẬT sau khi trừ, có thể âm.',
  })
  rawBalanceAfter: number;

  @ApiProperty({
    description:
      'false khi lượt trao này đã bị báo trước đó — không trừ điểm lần hai.',
  })
  penaltyApplied: boolean;
}
