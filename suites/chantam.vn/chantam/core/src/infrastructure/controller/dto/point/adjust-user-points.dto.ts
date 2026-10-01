import {
  IAdjustUserPointsBodyDto,
  IAdjustUserPointsResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { MaxAdminPointAdjustmentDelta } from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  NotEquals,
} from 'class-validator';

export class AdjustUserPointsBodyDto implements IAdjustUserPointsBodyDto {
  @ApiProperty({ format: 'uuid', description: 'Chủ tài khoản bị cộng/trừ.' })
  @IsUUID()
  userId: string;

  @ApiProperty({
    example: 56,
    minimum: -MaxAdminPointAdjustmentDelta,
    maximum: MaxAdminPointAdjustmentDelta,
    description:
      'Khác 0. Âm là khoản trừ, và khoản trừ có thể đẩy số dư THẬT xuống âm — ' +
      'số tiêu được thì vẫn kẹp ở 0.',
  })
  @IsInt()
  @NotEquals(0)
  @Min(-MaxAdminPointAdjustmentDelta)
  @Max(MaxAdminPointAdjustmentDelta)
  delta: number;

  @ApiProperty({
    minLength: 3,
    maxLength: 500,
    description:
      'Vì sao điều chỉnh. Bắt buộc, và đi vào cả `point_ledger.reason` lẫn ' +
      '`admin_audit_logs` — người bị trừ điểm đọc được lý do ở lịch sử điểm ' +
      'của chính mình.',
  })
  @IsString()
  @Length(3, 500)
  reason: string;

  @ApiPropertyOptional({
    maxLength: 200,
    description:
      'Khoá chống trùng do client đặt. Gửi lại cùng khoá thì KHÔNG ghi thêm gì ' +
      'và trả về đúng bút toán cũ với `applied: false` — dùng nó để một lần bấm ' +
      'đôi hoặc một lần thử lại sau timeout không cộng điểm hai lần.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  idempotencyKey?: string;
}

export class AdjustUserPointsResultDto {
  @ApiProperty({ example: 93 }) entryId: number;
  @ApiProperty({ example: 56 }) delta: number;
  @ApiProperty({ example: 156 }) balance: number;
  @ApiProperty({ example: 156, description: 'Số dư THẬT, có thể âm.' })
  rawBalance: number;
  @ApiProperty({ example: 212 }) lifetime: number;
  @ApiProperty({
    example: true,
    description: '`false` nghĩa là `idempotencyKey` đã dùng rồi.',
  })
  applied: boolean;
}

export class AdjustUserPointsResponseDto implements IAdjustUserPointsResponseDto {
  @ApiProperty({ type: () => AdjustUserPointsResultDto })
  adjustment: AdjustUserPointsResultDto;
}
