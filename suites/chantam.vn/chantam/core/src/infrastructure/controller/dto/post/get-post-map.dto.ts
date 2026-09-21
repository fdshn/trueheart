import {
  PostTypes,
  PublicDiscoveryPostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IGetPostMapQueryDto,
  IGetPostMapResponseDto,
  IPostMapMarkerDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class GetPostMapQueryDto implements IGetPostMapQueryDto {
  @ApiProperty({ example: 10.7 })
  @Type(() => Number)
  @IsLatitude()
  minLat: number;

  @ApiProperty({ example: 10.8 })
  @Type(() => Number)
  @IsLatitude()
  maxLat: number;

  @ApiProperty({ example: 106.6 })
  @Type(() => Number)
  @IsLongitude()
  minLng: number;

  @ApiProperty({ example: 106.8 })
  @Type(() => Number)
  @IsLongitude()
  maxLng: number;

  @ApiPropertyOptional({ example: 10.75 })
  @ValidateIf((query) => query.originLng !== undefined)
  @Type(() => Number)
  @IsLatitude()
  originLat?: number;

  @ApiPropertyOptional({ example: 106.7 })
  @ValidateIf((query) => query.originLat !== undefined)
  @Type(() => Number)
  @IsLongitude()
  originLng?: number;

  @ApiPropertyOptional({ enum: PublicDiscoveryPostTypes })
  @IsOptional()
  @IsIn(PublicDiscoveryPostTypes)
  postType?: (typeof PublicDiscoveryPostTypes)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class PostMapMarkerDto implements IPostMapMarkerDto {
  @ApiProperty({ format: 'uuid' })
  postId: string;

  @ApiProperty({ enum: PostTypes })
  postType: PostTypes;

  @ApiProperty({ format: 'uuid' })
  categoryId: string;

  @ApiProperty()
  areaLabel: string;

  @ApiProperty({
    type: 'object',
    properties: { lat: { type: 'number' }, lng: { type: 'number' } },
  })
  location: { lat: number; lng: number };

  @ApiPropertyOptional({ description: 'Khoảng cách đã bucket khi có origin.' })
  distanceMeters?: number;

  @ApiProperty()
  isLocationApproximate: true;

  @ApiProperty({ description: 'Tiêu đề bài, cho thẻ xem nhanh (F29).' })
  title: string;

  @ApiProperty({
    nullable: true,
    description: 'Ảnh đầu tiên của bài, null khi bài không có ảnh.',
  })
  thumbnailUrl: string | null;

  @ApiProperty({
    description: 'Bài Cần gấp — thẻ xem nhanh làm nổi bật (F17).',
  })
  isSos: boolean;

  @ApiProperty({
    example: '/posts/a3f1c0de-0000-4000-8000-000000000000',
    description:
      'Đường dẫn TƯƠNG ĐỐI tới màn chi tiết của module nguồn. Server không ghép tên miền.',
  })
  deepLinkPath: string;
}

export class GetPostMapResponseDto implements IGetPostMapResponseDto {
  @ApiProperty({ type: () => [PostMapMarkerDto] })
  markers: IPostMapMarkerDto[];
}
