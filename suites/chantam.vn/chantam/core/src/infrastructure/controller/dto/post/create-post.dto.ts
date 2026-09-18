import {
  GenericMvpPostTypes,
  GiftPostConditions,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  ICreatePostBodyDto,
  ICreatePostDto,
  ICreatePostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PostEntity } from '../../../entity/post.entity';
import { GeoPointDto } from '../geo-point.dto';

const MaxTotalQuantity = 10_000;
const MaxEstimatedValue = 1_000_000_000;

export class CreatePostDto implements ICreatePostDto {
  @ApiProperty({ enum: GenericMvpPostTypes })
  @IsEnum(GenericMvpPostTypes)
  postType: PostTypes;

  @ApiProperty({ minLength: 5, maxLength: 200 })
  @IsString()
  @Length(5, 200)
  title: string;

  @ApiProperty({ minLength: 10, maxLength: 5_000 })
  @IsString()
  @Length(10, 5_000)
  description: string;

  @ApiProperty({ format: 'uuid', description: 'Danh mục đang hoạt động.' })
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional({ enum: GiftPostConditions })
  @ValidateIf((post) => post.postType === PostTypes.OFFER)
  @IsEnum(GiftPostConditions)
  condition?: GiftPostConditions;

  @ApiPropertyOptional({ minimum: 0, maximum: MaxEstimatedValue })
  @ValidateIf((post) => post.postType === PostTypes.OFFER)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MaxEstimatedValue)
  estimatedValue?: number;

  @ApiProperty({ type: () => GeoPointDto })
  @ValidateNested()
  @Type(() => GeoPointDto)
  location: GeoPointDto;

  @ApiProperty({ minLength: 2, maxLength: 200 })
  @IsString()
  @Length(2, 200)
  areaLabel: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: MaxTotalQuantity })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MaxTotalQuantity)
  totalQuantity?: number;
}

export class CreatePostBodyDto implements ICreatePostBodyDto {
  @ApiProperty({ type: () => CreatePostDto })
  @ValidateNested()
  @Type(() => CreatePostDto)
  post: ICreatePostDto;
}

export class CreatePostResponseDto implements ICreatePostResponseDto {
  @ApiProperty({ type: () => PostEntity })
  post: IPostEntity;
}
