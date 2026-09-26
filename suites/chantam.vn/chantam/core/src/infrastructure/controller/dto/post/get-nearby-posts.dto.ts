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
  IsDefined,
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
  ValidateIf,
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

  @ApiPropertyOptional({
    minimum: MinSearchRadiusMeters,
    maximum: MaxSearchRadiusMeters,
    example: 5_000,
    description:
      'BẮT BUỘC khi có `lat`/`lng`. Bỏ trống cùng với toạ độ thì không lọc ' +
      'bán kính nữa và server trả toàn bộ (`originSource: ALL`).',
  })
  // Chỉ kiểm khi thực sự có tâm để quét. Không có tâm thì bán kính không lọc
  // gì, và bắt gửi nó là bắt client bịa một con số server sẽ lờ đi.
  @ValidateIf(
    (query: GetNearbyPostsQueryDto) =>
      query.lat !== undefined || query.lng !== undefined,
  )
  @Type(() => Number)
  @IsDefined()
  @IsInt()
  @Min(MinSearchRadiusMeters)
  @Max(MaxSearchRadiusMeters)
  radiusMeters?: number;

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

  @ApiProperty({
    example: 400,
    nullable: true,
    description:
      'Đã làm tròn theo bậc. `null` khi `originSource` là `ALL` — không có ' +
      'gốc toạ độ thì không có khoảng cách.',
  })
  distanceMeters: number | null;

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
    enum: ['REQUEST', 'DEFAULT_LOCATION', 'ALL'],
    description:
      'Gốc toạ độ đã dùng. `DEFAULT_LOCATION` nghĩa là client không gửi toạ ' +
      'độ và server đã lùi về Vị trí mặc định trong hồ sơ. `ALL` nghĩa là ' +
      'không có gốc nào nên server trả toàn bộ, mới nhất trước, và ' +
      '`distanceMeters` của mọi bài là `null`.',
  })
  originSource: 'REQUEST' | 'DEFAULT_LOCATION' | 'ALL';
}
