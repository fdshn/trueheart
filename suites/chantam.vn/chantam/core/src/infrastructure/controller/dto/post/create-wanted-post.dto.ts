import {
  ICreateWantedPostBodyDto,
  ICreateWantedPostDto,
  ICreateWantedPostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, IsUUID, Length, ValidateNested } from 'class-validator';
import { PostEntity } from '../../../entity/post.entity';
import { GeoPointDto } from '../geo-point.dto';

export class CreateWantedPostDto implements ICreateWantedPostDto {
  @ApiProperty({ minLength: 5, maxLength: 200 })
  @IsString()
  @Length(5, 200)
  title: string;

  @ApiProperty({ minLength: 10, maxLength: 5_000 })
  @IsString()
  @Length(10, 5_000)
  description: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId: string;

  @ApiProperty({ type: () => GeoPointDto })
  @ValidateNested()
  @Type(() => GeoPointDto)
  location: GeoPointDto;

  @ApiProperty({ minLength: 2, maxLength: 200 })
  @IsString()
  @Length(2, 200)
  areaLabel: string;
}

export class CreateWantedPostBodyDto implements ICreateWantedPostBodyDto {
  @ApiProperty({ type: () => CreateWantedPostDto })
  @ValidateNested()
  @Type(() => CreateWantedPostDto)
  post: ICreateWantedPostDto;
}

export class CreateWantedPostResponseDto implements ICreateWantedPostResponseDto {
  @ApiProperty({ type: () => PostEntity })
  post: IPostEntity;
}
