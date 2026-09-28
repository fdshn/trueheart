import { IGiftTransactionDto } from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsUUID, Length, ValidateNested } from 'class-validator';
import { GiftTransactionDto } from '../transaction/transaction.dto';

export class ReopenTransactionParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  transactionId: string;
}

export class ReopenTransactionDto {
  @ApiProperty({
    example: 'Hàng tới muộn, cron đóng nhầm',
    description: 'Bắt buộc — đây là quyết định sẽ bị hỏi lại.',
  })
  @Length(1, 500)
  reason: string;
}

export class ReopenTransactionBodyDto {
  @ApiProperty({ type: () => ReopenTransactionDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ReopenTransactionDto)
  reopen: ReopenTransactionDto;
}

export class ReopenTransactionResponseDto {
  @ApiProperty({ type: () => GiftTransactionDto })
  transaction: IGiftTransactionDto;
}
