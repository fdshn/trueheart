import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  IGetPublicProfileParamsDto,
  IGetPublicProfileResponseDto,
  IGiverAccuracySummaryDto,
  IPublicProfileDto,
  IReviewRatingSummaryDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';
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
}

export class GetPublicProfileResponseDto implements IGetPublicProfileResponseDto {
  @ApiProperty({ type: () => PublicProfileDto }) profile: IPublicProfileDto;
}
