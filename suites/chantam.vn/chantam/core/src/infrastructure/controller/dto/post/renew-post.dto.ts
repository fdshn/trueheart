import {
  IRenewPostParamsDto,
  IRenewPostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { PostEntity } from '../../../entity/post.entity';

export class RenewPostParamsDto implements IRenewPostParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  postId: string;
}

export class RenewPostResponseDto implements IRenewPostResponseDto {
  @ApiProperty({ type: () => PostEntity })
  post: IPostEntity;
}
