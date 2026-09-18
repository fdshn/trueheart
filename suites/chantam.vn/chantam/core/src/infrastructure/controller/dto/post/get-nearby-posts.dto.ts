import { PublicDiscoveryPostTypes } from '@chantam.vn/chantam.core-lib/consts';
import {
  IGetNearbyPostsQueryDto,
  IGetNearbyPostsResponseDto,
  INearbyPostDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import {
  MaxSearchRadiusMeters,
  MinSearchRadiusMeters,
} from '@chantam/service.persistency-lib/geo';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Mixin } from 'ts-mixer';
import { PostEntity } from '../../../entity/post.entity';

export class GetNearbyPostsQueryDto
  extends Mixin(PaginationQueryDto)
  implements IGetNearbyPostsQueryDto
{
  @ApiProperty({ example: 10.7724 })
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: 106.698 })
  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @ApiProperty({
    minimum: MinSearchRadiusMeters,
    maximum: MaxSearchRadiusMeters,
    example: 5_000,
  })
  @Type(() => Number)
  @IsInt()
  @Min(MinSearchRadiusMeters)
  @Max(MaxSearchRadiusMeters)
  radiusMeters: number;

  @ApiProperty({ enum: PublicDiscoveryPostTypes })
  @IsIn(PublicDiscoveryPostTypes)
  postType: (typeof PublicDiscoveryPostTypes)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class NearbyPostDto implements INearbyPostDto {
  @ApiProperty({ type: () => PostEntity })
  post: IPostEntity;

  @ApiProperty({ example: 400 })
  distanceMeters: number;

  @ApiProperty({ example: true })
  isLocationApproximate: true;
}

export class GetNearbyPostsResponseDto implements IGetNearbyPostsResponseDto {
  @ApiProperty({ type: () => [NearbyPostDto] })
  posts: INearbyPostDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}
