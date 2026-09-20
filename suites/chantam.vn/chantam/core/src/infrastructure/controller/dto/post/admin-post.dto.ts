import { IModerateAdminPostDto } from '@/application/contracts/post';
import { IAdminPostSummary } from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPublicPostMediaDto } from '@chantam.vn/chantam.core-lib/dto';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '@chantam/service.common-lib/dto';
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
import { Mixin } from 'ts-mixer';
import { PublicPostMediaDto } from './post.dto';

export class ListAdminPostsQueryDto extends Mixin(PaginationQueryDto) {
  @ApiPropertyOptional({ enum: GiftPostStatuses, default: 'PENDING_REVIEW' })
  @IsOptional()
  @IsEnum(GiftPostStatuses)
  status?: GiftPostStatuses;

  @ApiPropertyOptional({ enum: PostTypes })
  @IsOptional()
  @IsEnum(PostTypes)
  postType?: PostTypes;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  authorId?: string;

  @ApiPropertyOptional({
    description: 'Tìm trong tiêu đề, mô tả hoặc username.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  keyword?: string;
}

export class AdminPostParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  postId: string;
}

export class AdminPostSummaryDto implements IAdminPostSummary {
  @ApiProperty({ format: 'uuid' }) globalId: string;
  @ApiProperty({ enum: PostTypes }) postType: PostTypes;
  @ApiProperty({ format: 'uuid' }) authorId: string;
  @ApiProperty() authorUsername: string;
  @ApiProperty({ nullable: true }) authorFullName: string | null;
  @ApiProperty({ format: 'uuid' }) categoryId: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() areaLabel: string;
  @ApiProperty({ enum: GiftPostStatuses }) status: string;
  @ApiProperty() totalQuantity: number;
  @ApiProperty() remainingQuantity: number;
  @ApiProperty({ type: 'object', additionalProperties: true })
  details: Record<string, unknown>;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt: Date | null;
  @ApiProperty() mediaCount: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: Date;
}

export class ListAdminPostsResponseDto {
  @ApiProperty({ type: () => [AdminPostSummaryDto] })
  posts: IAdminPostSummary[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class GetAdminPostResponseDto {
  @ApiProperty({ type: () => AdminPostSummaryDto })
  post: IAdminPostSummary;

  @ApiProperty({ type: () => [PublicPostMediaDto] })
  media: IPublicPostMediaDto[];
}

export class ModerateAdminPostDto implements IModerateAdminPostDto {
  @ApiProperty({
    enum: [GiftPostStatuses.PUBLISHED, GiftPostStatuses.REJECTED],
  })
  @IsEnum([GiftPostStatuses.PUBLISHED, GiftPostStatuses.REJECTED])
  decision: GiftPostStatuses.PUBLISHED | GiftPostStatuses.REJECTED;

  @ApiProperty({ description: 'Lý do bắt buộc, được ghi vào audit log.' })
  @IsString()
  @Length(1, 500)
  reason: string;
}

export class ModerateAdminPostBodyDto {
  @ApiProperty({ type: () => ModerateAdminPostDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ModerateAdminPostDto)
  moderation: ModerateAdminPostDto;
}

export class ModerateAdminPostResponseDto {
  @ApiProperty({ type: () => AdminPostSummaryDto })
  post: IAdminPostSummary;
}
