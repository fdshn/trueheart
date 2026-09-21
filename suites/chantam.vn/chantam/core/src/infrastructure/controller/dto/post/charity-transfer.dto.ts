import { CharityTransferStatuses } from '@chantam.vn/chantam.core-lib/consts';
import {
  IRequestCharityTransferBodyDto,
  IRequestCharityTransferDto,
  IRequestCharityTransferParamsDto,
  IRequestCharityTransferResponseDto,
  IReviewCharityTransferBodyDto,
  IReviewCharityTransferDto,
  IReviewCharityTransferParamsDto,
  IReviewCharityTransferResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import { PostEntity } from '../../../entity/post.entity';

export class RequestCharityTransferParamsDto implements IRequestCharityTransferParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  postId: string;
}

export class RequestCharityTransferDto implements IRequestCharityTransferDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;
}

export class RequestCharityTransferBodyDto implements IRequestCharityTransferBodyDto {
  @ApiProperty({ type: () => RequestCharityTransferDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => RequestCharityTransferDto)
  transfer: IRequestCharityTransferDto;
}

export class RequestCharityTransferResponseDto implements IRequestCharityTransferResponseDto {
  @ApiProperty({ type: () => PostEntity })
  post: IPostEntity;
}

export class ReviewCharityTransferParamsDto implements IReviewCharityTransferParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  postId: string;
}

export class ReviewCharityTransferDto implements IReviewCharityTransferDto {
  @ApiProperty({
    enum: [CharityTransferStatuses.APPROVED, CharityTransferStatuses.REJECTED],
  })
  @IsEnum([CharityTransferStatuses.APPROVED, CharityTransferStatuses.REJECTED])
  status: CharityTransferStatuses.APPROVED | CharityTransferStatuses.REJECTED;
}

export class ReviewCharityTransferBodyDto implements IReviewCharityTransferBodyDto {
  @ApiProperty({ type: () => ReviewCharityTransferDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ReviewCharityTransferDto)
  transfer: IReviewCharityTransferDto;
}

export class ReviewCharityTransferResponseDto implements IReviewCharityTransferResponseDto {
  @ApiProperty({ type: () => PostEntity })
  post: IPostEntity;
}
