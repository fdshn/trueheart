import {
  IGiftRequestDto,
  IOfferGiftBodyDto,
  IOfferGiftResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { GiftRequestDto } from './gift-request.dto';

export class OfferGiftParamDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Bài Muốn Nhận được nhắm tới (`wanted_id` trong SRS §19).',
  })
  @IsUUID()
  wantedPostId: string;
}

export class OfferGiftBodyDto implements IOfferGiftBodyDto {
  @ApiProperty({
    example: 'Mình có sẵn món này muốn tặng bạn!',
    maxLength: 500,
    description: 'Lời nhắn gửi chủ bài Muốn Nhận.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Bài Muốn Tặng của CHÍNH bạn, đang còn công khai. Có nó thì chủ bài xem ' +
      'được ảnh, danh mục và vị trí của món đồ thay vì chỉ đọc một dòng chữ.',
  })
  @IsOptional()
  @IsUUID()
  offeringPostId?: string;
}

export class OfferGiftResponseDto implements IOfferGiftResponseDto {
  @ApiProperty({ type: () => GiftRequestDto })
  request: IGiftRequestDto;
}
