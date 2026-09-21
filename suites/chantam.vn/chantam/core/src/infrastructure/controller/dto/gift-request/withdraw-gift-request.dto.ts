import {
  IGiftRequestDto,
  IWithdrawGiftRequestResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { GiftRequestDto } from './gift-request.dto';

export class WithdrawGiftRequestParamDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Định danh canonical post muốn rút yêu cầu.',
  })
  @IsUUID()
  postId: string;
}

export class WithdrawGiftRequestResponseDto implements IWithdrawGiftRequestResponseDto {
  @ApiProperty({ type: () => GiftRequestDto })
  request: IGiftRequestDto;
}
