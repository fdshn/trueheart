import {
  GiftRequestStatuses,
  PublicDiscoveryPostTypes,
  ReactionKinds,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IGetNearbyPostsQueryDto,
  IGetNearbyPostsResponseDto,
  INearbyPostDto,
  IPublicPostMediaDto,
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
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Mixin } from 'ts-mixer';
import { PostEntity } from '../../../entity/post.entity';
import { PublicPostMediaDto } from './post.dto';

export class GetNearbyPostsQueryDto
  extends Mixin(PaginationQueryDto)
  implements IGetNearbyPostsQueryDto
{
  @ApiPropertyOptional({
    example: 10.7724,
    description:
      'Bỏ trống thì lùi về Vị trí mặc định của người đang đăng nhập (F26). Phải gửi cùng lng.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({
    example: 106.698,
    description: 'Bỏ trống thì lùi về Vị trí mặc định. Phải gửi cùng lat.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

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

  @ApiPropertyOptional({
    enum: PublicDiscoveryPostTypes,
    description:
      'Bỏ trống thì trả MỌI loại bài. Trước 26/09 tham số này bắt buộc, nên client muốn một feed trộn phải gọi năm lần rồi tự ghép — mà mỗi lần phân trang riêng nên ghép xong thứ tự vô nghĩa.',
  })
  @IsOptional()
  @IsIn(PublicDiscoveryPostTypes)
  postType?: (typeof PublicDiscoveryPostTypes)[number];

  @ApiPropertyOptional({
    example: 'nồi cơm điện',
    minLength: 2,
    maxLength: 100,
    description:
      'Tìm trong tiêu đề và mô tả. KHÔNG phân biệt dấu: gõ "noi com dien" vẫn ra "Nồi cơm điện". Mọi từ phải cùng xuất hiện, và khớp theo TỪ trọn vẹn — "nồi cơ" không ra "nồi cơm". Luôn bị giới hạn trong bán kính đang xem.',
  })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  keyword?: string;

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

  @ApiPropertyOptional({
    example: 3,
    description: 'Số lượng yêu cầu đang hoạt động',
  })
  requestCount?: number;

  @ApiPropertyOptional({
    enum: GiftRequestStatuses,
    nullable: true,
    description: 'Trạng thái yêu cầu của người dùng hiện tại',
  })
  myRequestStatus?: GiftRequestStatuses | null;

  @ApiPropertyOptional({
    example: false,
    description: 'Người dùng hiện tại đã gửi yêu cầu chưa',
  })
  hasRequested?: boolean;

  @ApiProperty({
    type: [PublicPostMediaDto],
    description:
      'Ảnh của bài, sắp sẵn theo `sortOrder`. Rỗng khi bài chưa có ảnh — ' +
      'cùng hình dạng với `/posts/me` và `/posts/{postId}`.',
  })
  media: IPublicPostMediaDto[];

  @ApiProperty({ example: 12 }) reactionCount: number;
  @ApiProperty({ example: 3 }) commentCount: number;
  @ApiProperty({ example: 1 }) shareCount: number;

  @ApiPropertyOptional({
    enum: ReactionKinds,
    nullable: true,
    description:
      'Cảm xúc của người gọi. `null` khi chưa bày tỏ hoặc chưa đăng nhập.',
  })
  myReaction: ReactionKinds | null;
}

export class GetNearbyPostsResponseDto implements IGetNearbyPostsResponseDto {
  @ApiProperty({ type: () => [NearbyPostDto] })
  posts: INearbyPostDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;

  @ApiProperty({
    enum: ['REQUEST', 'DEFAULT_LOCATION'],
    description:
      'Gốc toạ độ đã dùng. DEFAULT_LOCATION nghĩa là client không gửi toạ độ và server đã lùi về Vị trí mặc định trong hồ sơ.',
  })
  originSource: 'REQUEST' | 'DEFAULT_LOCATION';
}
