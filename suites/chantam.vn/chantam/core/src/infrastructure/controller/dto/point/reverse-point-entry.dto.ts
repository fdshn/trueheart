import {
  IReversePointEntryBodyDto,
  IReversePointEntryDto,
  IReversePointEntryResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReversePointEntryParamsDto {
  @ApiProperty({ example: 42, description: 'Id bút toán GỐC cần hoàn.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  entryId: number;
}

export class ReversePointEntryDto implements IReversePointEntryDto {
  @ApiProperty({
    minLength: 3,
    maxLength: 500,
    description:
      'Vì sao hoàn. Bắt buộc — một bút toán đảo không có lý do thì sáu tháng sau không ai giải thích được.',
  })
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class ReversePointEntryBodyDto implements IReversePointEntryBodyDto {
  @ApiProperty({ type: () => ReversePointEntryDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ReversePointEntryDto)
  reversal: ReversePointEntryDto;
}

export class ReversalResultDto {
  @ApiProperty({
    description: 'Bút toán HOÀN vừa ghi, không phải bút toán gốc.',
  })
  entryId: number;

  @ApiProperty({ example: -56 }) delta: number;
  @ApiProperty() balance: number;
  @ApiProperty({ description: 'Số dư THẬT, có thể âm.' }) rawBalance: number;
  @ApiProperty() lifetime: number;
}

export class ReversePointEntryResponseDto implements IReversePointEntryResponseDto {
  @ApiProperty({ type: () => ReversalResultDto })
  reversal: ReversalResultDto;
}
