import { GiftRequestStatuses } from '@chantam.vn/chantam.core-lib/consts';
import {
  IGetPostParamsDto,
  IGetPostResponseDto,
  IPostAuthorDto,
  IPostContactInfoDto,
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
  @ApiPropertyOptional() avatarUrl?: string | null;
  @ApiPropertyOptional() rank?: string;
  @ApiPropertyOptional({ description: 'Thời điểm tạo tài khoản.' })
  joinedAt?: Date | string | null;
}

export class PostContactInfoDto implements IPostContactInfoDto {
  @ApiPropertyOptional({ example: '0901234567' }) phone?: string | null;
  @ApiPropertyOptional({ example: '123 Nguyễn Huệ, Quận 1, TP.HCM' })
  address?: string | null;
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

  @ApiPropertyOptional({
    example: 5,
    description: 'Số lượt thích của bài đăng',
  })
  likeCount?: number;

  @ApiPropertyOptional({
    example: false,
    nullable: true,
    description:
      'Người dùng hiện tại đã thích bài đăng chưa (null nếu chưa đăng nhập)',
  })
  isLiked?: boolean | null;

  @ApiPropertyOptional({
    type: () => PostContactInfoDto,
    nullable: true,
    description:
      'Thông tin liên lạc của người cho (chỉ hiển thị khi là receiver được chọn)',
  })
  contactInfo?: IPostContactInfoDto | null;
}

export * from './toggle-post-like.dto';
