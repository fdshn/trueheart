import {
  IDeleteGiftPostParamsDto,
  IDeleteGiftPostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class DeleteGiftPostParamsDto implements IDeleteGiftPostParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  giftPostId: string;
}

export class DeleteGiftPostResponseDto implements IDeleteGiftPostResponseDto {
  @ApiProperty({ format: 'uuid' })
  giftPostId: string;

  @ApiProperty()
  deletedAt: Date;
}
