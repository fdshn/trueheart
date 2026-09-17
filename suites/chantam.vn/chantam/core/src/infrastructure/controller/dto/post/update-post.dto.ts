import {
  IUpdatePostBodyDto,
  IUpdatePostDto,
  IUpdatePostParamsDto,
  IUpdatePostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import { PostEntity } from '../../../entity/post.entity';

export class UpdatePostDto implements IUpdatePostDto {
  @ApiPropertyOptional({ minLength: 5, maxLength: 200 })
  @IsOptional()
  @IsString()
  @Length(5, 200)
  title?: string;

  @ApiPropertyOptional({ minLength: 10, maxLength: 5_000 })
  @IsOptional()
  @IsString()
  @Length(10, 5_000)
  description?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 200 })
  @IsOptional()
  @IsString()
  @Length(2, 200)
  areaLabel?: string;
}

export class UpdatePostParamsDto implements IUpdatePostParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  postId: string;
}

export class UpdatePostBodyDto implements IUpdatePostBodyDto {
  @ApiProperty({ type: () => UpdatePostDto })
  @ValidateNested()
  @Type(() => UpdatePostDto)
  post: IUpdatePostDto;
}

export class UpdatePostResponseDto implements IUpdatePostResponseDto {
  @ApiProperty({ type: () => PostEntity })
  post: IPostEntity;
}
