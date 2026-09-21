import {
  IAttachPostMediaBodyDto,
  IAttachPostMediaDto,
  IReorderPostMediaBodyDto,
  IReorderPostMediaDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IPostMediaEntity } from '@chantam.vn/chantam.core-lib/entities';
import { IStorageUploadResult } from '@chantam/service.storage-lib';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsDefined,
  IsInt,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import { PostMediaEntity } from '../../../entity/post-media.entity';

export class RequestPostMediaUploadDto {
  @ApiProperty({ example: 'image/webp' })
  @IsString()
  contentType: string;

  @ApiProperty({ example: 123456, description: 'Tối đa 5 MB.' })
  @Type(() => Number)
  @IsInt()
  contentLength: number;
}

export class AttachPostMediaDto implements IAttachPostMediaDto {
  @ApiProperty({
    description:
      'Key trả về từ endpoint upload sau khi client PUT thành công; không nhận URL.',
  })
  @IsString()
  @Length(1, 500)
  key: string;
}

export class AttachPostMediaBodyDto implements IAttachPostMediaBodyDto {
  @ApiProperty({ type: () => AttachPostMediaDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => AttachPostMediaDto)
  media: IAttachPostMediaDto;
}

export class ReorderPostMediaDto implements IReorderPostMediaDto {
  @ApiProperty({ type: () => [Number] })
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  mediaIds: number[];
}

export class ReorderPostMediaBodyDto implements IReorderPostMediaBodyDto {
  @ApiProperty({ type: () => ReorderPostMediaDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ReorderPostMediaDto)
  media: IReorderPostMediaDto;
}

export class PostMediaParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  postId: string;
}

export class PostMediaItemParamsDto extends PostMediaParamsDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  mediaId: number;
}

export class PostMediaUploadResponseDto implements IStorageUploadResult {
  @ApiProperty() key: string;
  @ApiProperty({ format: 'uri' }) uploadUrl: string;
  @ApiProperty() expiresInSeconds: number;
  @ApiProperty({ format: 'uri' }) publicUrl: string;
}

export class AttachPostMediaResponseDto {
  @ApiProperty({ type: () => PostMediaEntity })
  media: IPostMediaEntity;
}
