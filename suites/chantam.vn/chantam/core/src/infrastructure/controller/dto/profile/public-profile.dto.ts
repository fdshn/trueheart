import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  IGetPublicProfileParamsDto,
  IGetPublicProfileResponseDto,
  IPublicProfileDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

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
}

export class GetPublicProfileResponseDto implements IGetPublicProfileResponseDto {
  @ApiProperty({ type: () => PublicProfileDto }) profile: IPublicProfileDto;
}
