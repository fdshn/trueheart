import {
  GiftPostConditions,
  GiftPostStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IUpdateGiftPostBodyDto,
  IUpdateGiftPostDto,
  IUpdateGiftPostParamsDto,
  IUpdateGiftPostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IGiftPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { GiftPostEntity } from '../../../entity/gift-post.entity';

export class UpdateGiftPostDto implements IUpdateGiftPostDto {
  @ApiPropertyOptional({
    minLength: 5,
    maxLength: 200,
    description: 'Tiêu đề mới. Bỏ trống thì giữ nguyên.',
  })
  @IsOptional()
  @IsString()
  @Length(5, 200)
  title?: string;

  @ApiPropertyOptional({
    minLength: 10,
    maxLength: 5_000,
    description: 'Mô tả mới. Bỏ trống thì giữ nguyên.',
  })
  @IsOptional()
  @IsString()
  @Length(10, 5_000)
  description?: string;

  @ApiPropertyOptional({
    enum: GiftPostConditions,
    description: 'Cập nhật tình trạng món đồ.',
  })
  @IsOptional()
  @IsEnum(GiftPostConditions)
  condition?: GiftPostConditions;

  @ApiPropertyOptional({
    example: 1_200_000,
    minimum: 0,
    description: 'Giá trị ước tính mới (VNĐ).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedValue?: number;

  @ApiPropertyOptional({
    example: 'Quận 3, TP.HCM',
    minLength: 2,
    maxLength: 200,
    description: 'Nhãn khu vực mới. Vẫn ở mức phường/quận, đừng ghi số nhà.',
  })
  @IsOptional()
  @IsString()
  @Length(2, 200)
  areaLabel?: string;

  @ApiPropertyOptional({
    enum: GiftPostStatuses,
    description:
      'Chuyển trạng thái bài đăng, ví dụ `CANCELLED` khi người tặng đổi ý. ' +
      'Bài đã đóng ' +
      '(`COMPLETED`/`CANCELLED`) thì không sửa được nữa — trả về 409.',
  })
  @IsOptional()
  @IsEnum(GiftPostStatuses)
  status?: GiftPostStatuses;
}

export class UpdateGiftPostParamsDto implements IUpdateGiftPostParamsDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Định danh bài đăng cần sửa.',
  })
  @IsUUID()
  giftPostId: string;
}

export class UpdateGiftPostBodyDto implements IUpdateGiftPostBodyDto {
  @ApiProperty({
    type: () => UpdateGiftPostDto,
    description:
      'Chỉ gửi những trường muốn đổi; trường không gửi thì giữ nguyên.',
  })
  @IsDefined()
  @ValidateNested()
  @Type(() => UpdateGiftPostDto)
  giftPost: IUpdateGiftPostDto;
}

export class UpdateGiftPostResponseDto implements IUpdateGiftPostResponseDto {
  @ApiProperty({
    type: () => GiftPostEntity,
    description: 'Bài đăng sau khi cập nhật.',
  })
  giftPost: IGiftPostEntity;
}
