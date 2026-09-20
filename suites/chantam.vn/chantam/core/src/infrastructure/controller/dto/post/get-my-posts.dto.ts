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
import { IsOptional, IsString } from 'class-validator';
import { Mixin } from 'ts-mixer';
import { PostEntity } from '../../../entity/post.entity';
import { PublicPostMediaDto } from './post.dto';

export class GetMyPostsQueryDto
  extends Mixin(PaginationQueryDto)
  implements IGetMyPostsQueryDto
{
  @ApiPropertyOptional({
    description:
      'Lọc theo trạng thái bài đăng (PUBLISHED, PENDING_REVIEW, DELIVERING, COMPLETED,...)',
    example: 'PUBLISHED',
  })
  @IsOptional()
  @IsString()
  status?: string;
}

export class MyPostItemDto implements IMyPostItemDto {
  @ApiProperty({ type: PostEntity })
  post: IPostEntity;

  @ApiProperty({ example: 3, description: 'Số lượng yêu cầu xin đồ đang có' })
  requestCount: number;

  @ApiProperty({ type: [PublicPostMediaDto], description: 'Danh sách ảnh' })
  media: IPublicPostMediaDto[];
}

export class GetMyPostsResponseDto implements IGetMyPostsResponseDto {
  @ApiProperty({ type: [MyPostItemDto] })
  posts: IMyPostItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
