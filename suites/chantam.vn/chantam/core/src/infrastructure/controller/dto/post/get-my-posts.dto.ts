import {
  GenericMvpPostTypes,
  GiftPostStatuses,
  PostTypes,
  ReactionKinds,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IGetMyPostsQueryDto,
  IGetMyPostsResponseDto,
  IMyPostItemDto,
  IPublicPostMediaDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { Mixin } from 'ts-mixer';
import { PostEntity } from '../../../entity/post.entity';
import { PublicPostMediaDto } from './post.dto';

export class GetMyPostsQueryDto
  extends Mixin(PaginationQueryDto)
  implements IGetMyPostsQueryDto
{
  @ApiPropertyOptional({
    enum: GenericMvpPostTypes,
    description: 'Lọc theo loại bài, ví dụ CLASSIFIED cho tin rao vặt.',
  })
  @IsOptional()
  @IsEnum(PostTypes)
  postType?: PostTypes;

  @ApiPropertyOptional({
    enum: GiftPostStatuses,
    description:
      'Lọc theo trạng thái duyệt/hiển thị. Bỏ trống trả mọi trạng thái, ' +
      'kể cả bài bị Admin gỡ (REJECTED) và bài đã hết hạn — đây là bài của chính bạn.',
  })
  @IsOptional()
  @IsEnum(GiftPostStatuses)
  status?: GiftPostStatuses;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class MyPostItemDto implements IMyPostItemDto {
  @ApiProperty({ type: () => PostEntity })
  post: IPostEntity;

  @ApiProperty({ example: 3, description: 'Số lượng yêu cầu xin đồ đang có' })
  requestCount: number;

  @ApiProperty({ type: [PublicPostMediaDto], description: 'Danh sách ảnh' })
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

export class GetMyPostsResponseDto implements IGetMyPostsResponseDto {
  @ApiProperty({ type: () => [MyPostItemDto] })
  posts: IMyPostItemDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}
