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
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(5, 200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(10, 5_000)
  description?: string;

  @ApiPropertyOptional({ enum: GiftPostConditions })
  @IsOptional()
  @IsEnum(GiftPostConditions)
  condition?: GiftPostConditions;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 200)
  areaLabel?: string;

  @ApiPropertyOptional({ enum: GiftPostStatuses })
  @IsOptional()
  @IsEnum(GiftPostStatuses)
  status?: GiftPostStatuses;
}

export class UpdateGiftPostParamsDto implements IUpdateGiftPostParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  giftPostId: string;
}

export class UpdateGiftPostBodyDto implements IUpdateGiftPostBodyDto {
  @ApiProperty({ type: () => UpdateGiftPostDto })
  @ValidateNested()
  @Type(() => UpdateGiftPostDto)
  giftPost: IUpdateGiftPostDto;
}

export class UpdateGiftPostResponseDto implements IUpdateGiftPostResponseDto {
  @ApiProperty({ type: () => GiftPostEntity })
  giftPost: IGiftPostEntity;
}
