import { GiftPostConditions } from '@chantam.vn/chantam.core-lib/consts';
import {
  IUpdatePostBodyDto,
  IUpdatePostDto,
  IUpdatePostParamsDto,
  IUpdatePostResponseDto,
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
  ValidateNested,
} from 'class-validator';
import { PostEntity } from '../../../entity/post.entity';
import { GeoPointDto } from '../geo-point.dto';

export class UpdatePostDto implements IUpdatePostDto {
  @ApiPropertyOptional({ minLength: 5, maxLength: 200 })
  @IsOptional()
  @IsString()
  @Length(5, 200)
  title?: string;

  @ApiPropertyOptional({ minLength: 10, maxLength: 5_000 })
  @IsOptional()
  @IsString()
  @Length(10, 5_000)
  description?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 200 })
  @IsOptional()
  @IsString()
  @Length(2, 200)
  areaLabel?: string;

  @ApiPropertyOptional({
    enum: GiftPostConditions,
    description: 'Chỉ áp dụng cho bài OFFER.',
  })
  @IsOptional()
  @IsEnum(GiftPostConditions)
  condition?: GiftPostConditions;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 1_000_000_000,
    description: 'Chỉ áp dụng cho bài OFFER.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  estimatedValue?: number;

  @ApiPropertyOptional({ type: () => GeoPointDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoPointDto)
  location?: GeoPointDto;
}

export class UpdatePostParamsDto implements IUpdatePostParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  postId: string;
}

export class UpdatePostBodyDto implements IUpdatePostBodyDto {
  @ApiProperty({ type: () => UpdatePostDto })
  @ValidateNested()
  @Type(() => UpdatePostDto)
  post: IUpdatePostDto;
}

export class UpdatePostResponseDto implements IUpdatePostResponseDto {
  @ApiProperty({ type: () => PostEntity })
  post: IPostEntity;
}
