import { GiftRequestStatuses } from '@chantam.vn/chantam.core-lib/consts';
import {
  IGetPostParamsDto,
  IGetPostResponseDto,
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

export class PublicPostMediaDto implements IPublicPostMediaDto {
  @ApiProperty() id: number;
  @ApiProperty({ format: 'uri' }) url: string;
  @ApiProperty() sortOrder: number;
}

export class GetPostResponseDto implements IGetPostResponseDto {
  @ApiProperty({ type: () => PostEntity })
  post: IPostEntity;

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
}
