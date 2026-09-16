import {
  IGetGiftPostParamsDto,
  IGetGiftPostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IGiftPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { GiftPostEntity } from '../../../entity/gift-post.entity';

export class GetGiftPostParamsDto implements IGetGiftPostParamsDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Định danh bài đăng (UUID), lấy từ kết quả tạo bài hoặc từ bảng tin.',
  })
  @IsUUID()
  giftPostId: string;
}

export class GetGiftPostResponseDto implements IGetGiftPostResponseDto {
  @ApiProperty({
    type: () => GiftPostEntity,
    description: 'Chi tiết bài đăng.',
  })
  giftPost: IGiftPostEntity;

  @ApiProperty({
    description:
      '`true` khi toạ độ đã bị làm nhiễu vì người gọi chưa được người tặng ' +
      'duyệt cho nhận. Chỉ sau khi được duyệt mới thấy toạ độ thật.',
  })
  isLocationApproximate: boolean;
}
