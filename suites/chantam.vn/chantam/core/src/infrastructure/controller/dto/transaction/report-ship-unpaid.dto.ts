import { MaxEvidencePerKind } from '@chantam.vn/chantam.core-lib/consts';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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

  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: MaxEvidencePerKind,
    description:
      'Ảnh gói hàng QUAY VỀ, bắt buộc. Ảnh lúc trao chỉ chứng minh người tặng có trao; ảnh hàng quay về mới chứng minh nó không tới đích.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MaxEvidencePerKind)
  @IsString({ each: true })
  @Length(1, 500, { each: true })
  evidenceKeys: string[];
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

  @ApiProperty({
    example: 'CANCELLED',
    description:
      'Báo thì đóng luôn lượt trao. Không đóng thì cron tự hoàn tất sẽ đánh dấu COMPLETED sau 5 ngày — người nhận vừa bị trừ điểm, vừa được ghi công đã nhận quà.',
  })
  transactionStatus: string;
}
