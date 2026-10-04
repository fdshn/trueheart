import {
  DeliveryMethods,
  GiftPostConditions,
  ShipPayers,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IUpdatePostBodyDto,
  IUpdatePostDto,
  IUpdatePostParamsDto,
  IUpdatePostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { MaxClassifiedPrice } from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
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

export class UpdatePostDto implements IUpdatePostDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_post, value) => value !== undefined)
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10_000 })
  @ValidateIf((_post, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  totalQuantity?: number;

  @ApiPropertyOptional()
  @ValidateIf((_post, value) => value !== undefined)
  @IsBoolean()
  isSos?: boolean;

  @ApiPropertyOptional({ enum: DeliveryMethods, nullable: true })
  @IsOptional()
  @IsEnum(DeliveryMethods)
  deliveryMethod?: DeliveryMethods | null;

  @ApiPropertyOptional({ enum: ShipPayers, nullable: true })
  @IsOptional()
  @IsEnum(ShipPayers)
  shipPayer?: ShipPayers | null;

  @ApiPropertyOptional({ minimum: 0, maximum: MaxClassifiedPrice })
  @ValidateIf((_post, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MaxClassifiedPrice)
  price?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: MaxClassifiedPrice,
    nullable: true,
    description:
      'Giá thị trường tự khai (CHỐT-05). Gửi `null` để **xoá** con số đã khai — ' +
      'khác với bỏ trống trường, là "không đổi".',
  })
  @ValidateIf((_post, value) => value !== undefined && value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MaxClassifiedPrice)
  marketPrice?: number | null;

  @ApiPropertyOptional()
  @ValidateIf((_post, value) => value !== undefined)
  @IsBoolean()
  negotiable?: boolean;

  @ApiPropertyOptional({ minLength: 5, maxLength: 200 })
  @ValidateIf((_post, value) => value !== undefined)
  @IsString()
  @Length(5, 200)
  title?: string;

  @ApiPropertyOptional({ minLength: 10, maxLength: 5_000 })
  @ValidateIf((_post, value) => value !== undefined)
  @IsString()
  @Length(10, 5_000)
  description?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 200 })
  @ValidateIf((_post, value) => value !== undefined)
  @IsString()
  @Length(2, 200)
  areaLabel?: string;

  @ApiPropertyOptional({
    enum: GiftPostConditions,
    description: 'Chỉ áp dụng cho bài OFFER và CLASSIFIED.',
  })
  @ValidateIf((_post, value) => value !== undefined)
  @IsEnum(GiftPostConditions)
  condition?: GiftPostConditions;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 1_000_000_000,
    description: 'Chỉ áp dụng cho bài OFFER.',
  })
  @ValidateIf((_post, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  estimatedValue?: number;

  @ApiPropertyOptional({ type: () => GeoPointDto })
  @ValidateIf((_post, value) => value !== undefined)
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
  @IsDefined()
  @ValidateNested()
  @Type(() => UpdatePostDto)
  post: IUpdatePostDto;
}

export class UpdatePostResponseDto implements IUpdatePostResponseDto {
  @ApiProperty({ type: () => PostEntity })
  post: IPostEntity;
}
