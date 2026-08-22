import {
  IGetGiftPostParamsDto,
  IGetGiftPostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IGiftPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { GiftPostEntity } from '../../../entity/gift-post.entity';

export class GetGiftPostParamsDto implements IGetGiftPostParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  giftPostId: string;
}

export class GetGiftPostResponseDto implements IGetGiftPostResponseDto {
  @ApiProperty({ type: () => GiftPostEntity })
  giftPost: IGiftPostEntity;

  @ApiProperty({
    description:
      'true khi toạ độ đã bị làm nhiễu vì người gọi chưa được duyệt nhận',
  })
  isLocationApproximate: boolean;
}
