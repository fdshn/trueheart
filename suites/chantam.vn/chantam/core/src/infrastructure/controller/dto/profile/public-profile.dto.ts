import {
  LeaderboardBoards,
  PostTypes,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IGetPublicProfileParamsDto,
  IGetPublicProfileResponseDto,
  IGiverAccuracySummaryDto,
  INearbyPostDto,
  IProfileBadgeDto,
  IPublicContactsDto,
  IPublicMonthlyStandingDto,
  IPublicProfileDto,
  IReviewRatingSummaryDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { Mixin } from 'ts-mixer';
import { ProfileBadgeDto } from '../leaderboard/leaderboard.dto';
import { NearbyPostDto } from '../post/get-nearby-posts.dto';
import { GiverAccuracySummaryDto, ReviewRatingSummaryDto } from './profile.dto';

const UsernamePattern = /^[a-zA-Z0-9_-]+$/;

export class GetPublicProfileParamsDto implements IGetPublicProfileParamsDto {
  @ApiProperty({ description: 'Username URL-safe của hồ sơ cần xem.' })
  @IsString()
  @Length(3, 50)
  @Matches(UsernamePattern)
  username: string;
}

export class PublicProfileDto implements IPublicProfileDto {
  @ApiProperty() username: string;
  @ApiProperty({ nullable: true }) fullName: string | null;
  @ApiProperty({ nullable: true }) avatarUrl: string | null;
  @ApiProperty({ enum: UserRanks }) rank: UserRanks;
  @ApiProperty({ description: 'Số bài PUBLISHED đang hiển thị công khai.' })
  publishedGiftPostCount: number;

  @ApiProperty({
    example: 1792,
    description:
      'Điểm tích luỹ quyết định hạng. Không phải số dư tiêu được của chủ tài khoản.',
  })
  lifetimePoints: number;

  @ApiProperty({
    nullable: true,
    example: 'https://chantam.vn/u/nguoi-demo',
    description: 'Link chia sẻ hồ sơ; null khi chưa cấu hình web công khai.',
  })
  shareUrl: string | null;

  @ApiProperty({
    type: () => GiverAccuracySummaryDto,
    nullable: true,
    description:
      'Độ chính xác mô tả khi tặng (F43). `null` khi người này chưa có mẫu nào. Cố ý KHÔNG kèm cờ xem xét: cờ là tín hiệu để Admin nhìn qua, hiện nó ra công khai là biến một việc cần người thật xem lại thành một dấu đóng lên mặt người ta.',
  })
  accuracy: IGiverAccuracySummaryDto | null;

  @ApiProperty({
    type: () => ReviewRatingSummaryDto,
    description:
      'Điểm sao 1–5 theo từng vai (F42) — người đang chọn xin nhận cần con số khác với chủ bài đang duyệt.',
  })
  rating: IReviewRatingSummaryDto;

  @ApiProperty({
    type: () => [ProfileBadgeDto],
    description:
      'Huy hiệu bảng thành tích tháng còn hạn. KHÔNG gồm huy hiệu giành lúc ẩn danh — hiện nó là ghép được với dòng "Người ẩn danh" cùng hạng trên bảng.',
  })
  badges: IProfileBadgeDto[];

  @ApiProperty({ type: String, nullable: true }) slogan: string | null;
  @ApiProperty({ type: String, nullable: true }) todayThought: string | null;
  @ApiProperty({ type: Date, nullable: true })
  todayThoughtUpdatedAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) introVideoUrl: string | null;
  @ApiProperty({ type: String, nullable: true })
  introVideoThumbnailUrl: string | null;

  @ApiProperty({
    type: () => PublicMonthlyStandingDto,
    nullable: true,
    description:
      'Vị trí tháng hiện tại trên bảng Người cho. `null` khi người này ẩn danh trên bảng thành tích, hoặc Admin tắt bảng.',
  })
  monthlyStanding: IPublicMonthlyStandingDto | null;

  @ApiProperty({
    type: () => PublicContactsDto,
    description:
      'Từng trường `null` trừ khi chủ hồ sơ đặt chế độ hiển thị `PUBLIC`.',
  })
  contacts: IPublicContactsDto;
}

export class PublicMonthlyStandingDto implements IPublicMonthlyStandingDto {
  @ApiProperty({ example: '2026-10' }) month: string;
  @ApiProperty({ enum: [LeaderboardBoards.GIVERS] })
  board: LeaderboardBoards.GIVERS;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: '`null` khi chưa lên bảng.',
  })
  rank: number | null;
  @ApiProperty() count: number;
}

export class PublicContactsDto implements IPublicContactsDto {
  @ApiProperty({ type: String, nullable: true }) email: string | null;
  @ApiProperty({ type: String, nullable: true }) phone: string | null;
}

export class GetPublicProfileResponseDto implements IGetPublicProfileResponseDto {
  @ApiProperty({ type: () => PublicProfileDto }) profile: IPublicProfileDto;
}

export class ListUserPostsQueryDto extends Mixin(PaginationQueryDto) {
  @ApiPropertyOptional({ enum: PostTypes })
  @IsOptional()
  @IsEnum(PostTypes)
  postType?: PostTypes;

  @ApiPropertyOptional({
    example: 'PUBLISHED',
    description:
      'Người khác chỉ thấy `PUBLISHED` và `RESERVED`; lọc trạng thái khác trả danh sách rỗng. Chính chủ lọc được mọi trạng thái.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;
}

export class ListUserPostsResponseDto {
  @ApiProperty({ type: () => [NearbyPostDto] })
  posts: INearbyPostDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}
