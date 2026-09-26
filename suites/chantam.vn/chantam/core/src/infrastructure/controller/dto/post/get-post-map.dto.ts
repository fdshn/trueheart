import {
  PostTypes,
  PublicDiscoveryPostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IGetPostMapQueryDto,
  IGetPostMapResponseDto,
  IPostMapClusterDto,
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

export class PostMapClusterDto implements IPostMapClusterDto {
  @ApiProperty({
    example: '106.625:10.75',
    description:
      'Khoá của ô, ổn định giữa các lần gọi cùng mức phóng to — client dùng làm key khi vẽ lại để cụm không nhấp nháy lúc kéo bản đồ.',
  })
  cellKey: string;

  @ApiProperty({ example: 47, description: 'Số bài trong ô.' })
  count: number;

  @ApiProperty({
    type: 'object',
    properties: { lat: { type: 'number' }, lng: { type: 'number' } },
    description:
      'Nhiều bài thì là TÂM Ô; đúng một bài thì là toạ độ bài đã làm nhiễu. Không bao giờ là toạ độ thật.',
  })
  location: { lat: number; lng: number };

  @ApiProperty({ example: true })
  isLocationApproximate: true;

  @ApiProperty({
    type: () => PostMapMarkerDto,
    nullable: true,
    description:
      'Chỉ có khi `count === 1` — đủ dữ liệu cho thẻ xem nhanh mà không phải gọi thêm vòng nữa (F29).',
  })
  marker: IPostMapMarkerDto | null;
}

export class GetPostMapResponseDto implements IGetPostMapResponseDto {
  @ApiProperty({ type: () => [PostMapClusterDto] })
  clusters: IPostMapClusterDto[];

  @ApiProperty({
    example: 3_128,
    description:
      'Tổng số bài trong khung nhìn — con số THẬT, đếm trước khi cắt. Bản cũ cắt ở 200 marker và không báo gì, nên người dùng zoom ra thấy bản đồ thưa hơn lúc zoom vào.',
  })
  total: number;

  @ApiProperty({
    example: 0.0078125,
    description: 'Cỡ ô lưới theo độ — client cần để vẽ vùng cụm.',
  })
  cellSizeDegrees: number;

  @ApiProperty({
    example: false,
    description: 'Số ô vượt trần nên danh sách đã bị cắt bớt.',
  })
  truncated: boolean;
}
