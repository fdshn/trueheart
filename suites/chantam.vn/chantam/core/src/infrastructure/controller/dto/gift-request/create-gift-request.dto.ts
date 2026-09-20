import {
  ICreateGiftRequestBodyDto,
  ICreateGiftRequestResponseDto,
  IGiftRequestDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
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
}

export class CreateGiftRequestResponseDto implements ICreateGiftRequestResponseDto {
  @ApiProperty({ type: () => GiftRequestDto })
  request: IGiftRequestDto;
}
