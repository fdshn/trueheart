import { GiftRequestStatuses } from '@chantam.vn/chantam.core-lib/consts';
import {
  IGetPostRequestsResponseDto,
  IPostApplicantProfileDto,
  IPostRequestItemDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { PaginationQueryDto } from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { Mixin } from 'ts-mixer';

export class ListPostRequestsParamDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Định danh canonical post.',
  })
  @IsUUID()
  postId: string;
}

/** Phân trang chuẩn của repo: `page` và `pageSize`, KHÔNG phải `limit`. */
export class ListPostRequestsQueryDto extends Mixin(PaginationQueryDto) {}

export class PostApplicantProfileDto implements IPostApplicantProfileDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  username: string;

  @ApiProperty({ nullable: true })
  fullName: string | null;

  @ApiProperty({ nullable: true })
  avatarUrl: string | null;

  @ApiProperty()
  rank: string;
}

export class PostRequestItemDto implements IPostRequestItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  postId: string;

  @ApiProperty()
  requesterId: string;

  @ApiProperty()
  message: string;

  @ApiProperty({ enum: GiftRequestStatuses })
  status: GiftRequestStatuses;

  @ApiProperty()
  queueJoinedAt: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({ type: () => PostApplicantProfileDto })
  requester?: IPostApplicantProfileDto;
}

export class GetPostRequestsResponseDto implements IGetPostRequestsResponseDto {
  @ApiProperty({ type: () => [PostRequestItemDto] })
  requests: IPostRequestItemDto[];

  @ApiProperty()
  total: number;
}
