import {
  ICreateGiftRequestBodyDto,
  ICreateGiftRequestResponseDto,
  IGiftRequestDto,
  IUpdateGiftRequestBodyDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { GiftRequestDto } from './gift-request.dto';

export class CreateGiftRequestParamDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Định danh canonical post muốn gửi yêu cầu.',
  })
  @IsUUID()
  postId: string;
}

export class CreateGiftRequestBodyDto implements ICreateGiftRequestBodyDto {
  @ApiProperty({
    example:
      'Em chào anh chị, em là sinh viên mới lên TP, em xin phép nhận đồ này được không ạ?',
    description: 'Lời nhắn gửi đến người cho đồ (tối đa 500 ký tự).',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message: string;

  @ApiPropertyOptional({
    minimum: 1,
    default: 1,
    example: 2,
    description:
      'Số món xin; bỏ trống = 1. Không vượt `remainingQuantity` của bài lúc gửi (`GIFT_REQUEST_QUANTITY_EXCEEDS_STOCK`).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  requestedQuantity?: number;
}

export class UpdateGiftRequestQuantityDto {
  @ApiProperty({
    minimum: 1,
    example: 2,
    description:
      'Số món mới — chỉ được GIẢM so với số đang xin. Request đang `STANDBY` mà số mới không vượt số còn lại thì quay về `PENDING`, giữ nguyên vị trí trong hàng.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  requestedQuantity: number;
}

export class UpdateGiftRequestBodyDto implements IUpdateGiftRequestBodyDto {
  @ApiProperty({ type: () => UpdateGiftRequestQuantityDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => UpdateGiftRequestQuantityDto)
  request: UpdateGiftRequestQuantityDto;
}

export class CreateGiftRequestResponseDto implements ICreateGiftRequestResponseDto {
  @ApiProperty({ type: () => GiftRequestDto })
  request: IGiftRequestDto;
}
