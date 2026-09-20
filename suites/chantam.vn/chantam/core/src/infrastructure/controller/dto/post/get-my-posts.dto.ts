import {
  GenericMvpPostTypes,
  GiftPostStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IGetMyPostsQueryDto,
  IGetMyPostsResponseDto,
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
      'kể cả PENDING_REVIEW và REJECTED — đây là bài của chính bạn.',
  })
  @IsOptional()
  @IsEnum(GiftPostStatuses)
  status?: GiftPostStatuses;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class GetMyPostsResponseDto implements IGetMyPostsResponseDto {
  @ApiProperty({ type: () => [PostEntity] })
  posts: IPostEntity[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}
