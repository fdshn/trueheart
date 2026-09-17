import { GiftPostStatuses } from '@chantam.vn/chantam.core-lib/consts';
import {
  IModeratePostBodyDto,
  IModeratePostDto,
  IModeratePostParamsDto,
  IModeratePostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsUUID, ValidateNested } from 'class-validator';
import { PostEntity } from '../../../entity/post.entity';

export class ModeratePostDto implements IModeratePostDto {
  @ApiProperty({
    enum: [GiftPostStatuses.PUBLISHED, GiftPostStatuses.REJECTED],
  })
  @IsEnum([GiftPostStatuses.PUBLISHED, GiftPostStatuses.REJECTED])
  status: GiftPostStatuses.PUBLISHED | GiftPostStatuses.REJECTED;
}

export class ModeratePostParamsDto implements IModeratePostParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  postId: string;
}

export class ModeratePostBodyDto implements IModeratePostBodyDto {
  @ApiProperty({ type: () => ModeratePostDto })
  @ValidateNested()
  @Type(() => ModeratePostDto)
  post: IModeratePostDto;
}

export class ModeratePostResponseDto implements IModeratePostResponseDto {
  @ApiProperty({ type: () => PostEntity })
  post: IPostEntity;
}
