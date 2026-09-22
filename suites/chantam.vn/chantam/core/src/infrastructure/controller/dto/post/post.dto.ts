import {
  GiftRequestStatuses,
  ReactionKinds,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IGetPostParamsDto,
  IGetPostResponseDto,
  IPostAuthorDto,
  IPublicPostMediaDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { PostEntity } from '../../../entity/post.entity';

export class GetPostParamsDto implements IGetPostParamsDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Định danh canonical post.',
  })
  @IsUUID()
  postId: string;
}

export class PostAuthorDto implements IPostAuthorDto {
  @ApiProperty() id: string;
  @ApiProperty() username: string;
  @ApiPropertyOptional() fullName?: string | null;
  @ApiPropertyOptional() avatarUrl?: string | null;
  @ApiPropertyOptional() rank?: string;
}

export class PublicPostMediaDto implements IPublicPostMediaDto {
  @ApiProperty() id: number;
  @ApiProperty({ format: 'uri' }) url: string;
  @ApiProperty() sortOrder: number;
}

export class GetPostResponseDto implements IGetPostResponseDto {
  @ApiProperty({ type: () => PostEntity })
  post: IPostEntity;

  @ApiPropertyOptional({ type: () => PostAuthorDto })
  author?: IPostAuthorDto | null;

  @ApiProperty({ type: () => [PublicPostMediaDto] })
  media: IPublicPostMediaDto[];

  @ApiProperty({
    description: 'Toạ độ luôn bị làm nhiễu với kênh đọc công khai.',
  })
  isLocationApproximate: boolean;

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

  @ApiProperty({ example: 12, description: 'Số người đã bày tỏ cảm xúc' })
  reactionCount: number;

  @ApiProperty({ example: 3, description: 'Số bình luận gốc còn hiện' })
  commentCount: number;

  @ApiProperty({ example: 1, description: 'Số lần chia sẻ đã ghi nhận' })
  shareCount: number;

  @ApiPropertyOptional({
    enum: ReactionKinds,
    nullable: true,
    description:
      'Cảm xúc của người gọi. `null` khi chưa bày tỏ hoặc chưa đăng nhập.',
  })
  myReaction: ReactionKinds | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    description:
      'Phân bổ theo loại cảm xúc. Chỉ có trên màn chi tiết — bảng tin chỉ cần tổng số.',
    example: { LIKE: 8, LOVE: 4 },
  })
  reactionBreakdown: Partial<Record<ReactionKinds, number>>;
}
