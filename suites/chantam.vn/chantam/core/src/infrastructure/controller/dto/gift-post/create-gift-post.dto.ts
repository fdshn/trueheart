import {
  GiftPostCategories,
  GiftPostConditions,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  ICreateGiftPostBodyDto,
  ICreateGiftPostDto,
  ICreateGiftPostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IGiftPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { GiftPostEntity } from '../../../entity/gift-post.entity';
import { GeoPointDto } from '../geo-point.dto';

/** Trần số lượng cho một bài đăng — chặn khai khống để cày điểm cống hiến. */
const MaxTotalQuantity = 10_000;
/** Trần giá trị ước tính: 1 tỷ VNĐ. */
const MaxEstimatedValue = 1_000_000_000;

export class CreateGiftPostDto implements ICreateGiftPostDto {
  @ApiProperty({ example: 'Xe đạp cũ còn dùng tốt' })
  @IsString()
  @Length(5, 200)
  title: string;

  @ApiProperty()
  @IsString()
  @Length(10, 5_000)
  description: string;

  @ApiProperty({ enum: GiftPostCategories })
  @IsEnum(GiftPostCategories)
  category: GiftPostCategories;

  @ApiProperty({ enum: GiftPostConditions })
  @IsEnum(GiftPostConditions)
  condition: GiftPostConditions;

  @ApiProperty({
    example: 1_500_000,
    description: 'Giá trị ước tính (VNĐ). 100.000đ quy đổi 1 điểm cống hiến.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MaxEstimatedValue)
  estimatedValue: number;

  @ApiProperty({ type: () => GeoPointDto })
  @ValidateNested()
  @Type(() => GeoPointDto)
  location: GeoPointDto;

  @ApiProperty({ example: 'Quận 1, TP.HCM' })
  @IsString()
  @Length(2, 200)
  areaLabel: string;

  @ApiPropertyOptional({ default: 1, maximum: MaxTotalQuantity })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MaxTotalQuantity)
  totalQuantity?: number;

  @ApiProperty({
    format: 'uuid',
    description: 'TẠM THỜI: sẽ lấy từ access token khi có auth-lib',
  })
  @IsUUID()
  giverId: string;
}

export class CreateGiftPostBodyDto implements ICreateGiftPostBodyDto {
  @ApiProperty({ type: () => CreateGiftPostDto })
  @ValidateNested()
  @Type(() => CreateGiftPostDto)
  giftPost: ICreateGiftPostDto;
}

export class CreateGiftPostResponseDto implements ICreateGiftPostResponseDto {
  @ApiProperty({ type: () => GiftPostEntity })
  giftPost: IGiftPostEntity;
}
