import {
  MaxPageSize,
  PaginationMetaDto,
} from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Chỉ ảnh — mọi ô ảnh của CMS là ảnh tĩnh. Khớp `AllowedImageContentTypes` của storage-lib. */
const CmsMediaContentTypes = ['image/jpeg', 'image/png', 'image/webp'];

export class RequestCmsMediaUploadDto {
  @ApiProperty({ enum: CmsMediaContentTypes, example: 'image/webp' })
  @IsIn(CmsMediaContentTypes)
  contentType: string;

  @ApiProperty({
    minimum: 1,
    example: 512_000,
    description:
      'Tối đa 5 MB. Được ký vào URL — PUT lệch một byte là hỏng chữ ký.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  contentLength: number;
}

export class RequestCmsMediaUploadBodyDto {
  @ApiProperty({ type: () => RequestCmsMediaUploadDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => RequestCmsMediaUploadDto)
  upload: RequestCmsMediaUploadDto;
}

export class CmsMediaUploadDto {
  @ApiProperty() key: string;
  @ApiProperty({
    description: 'PUT file thẳng lên đây, kèm đúng Content-Type.',
  })
  uploadUrl: string;
  @ApiProperty({ example: 300 }) expiresInSeconds: number;
  @ApiProperty({
    description: 'Chỉ mở được SAU khi PUT xong và đã xác nhận.',
  })
  publicUrl: string;
}

export class RequestCmsMediaUploadResponseDto {
  @ApiProperty({ type: () => CmsMediaUploadDto })
  upload: CmsMediaUploadDto;
}

export class ConfirmCmsMediaDto {
  @ApiProperty({ example: 'users/<adminId>/cms-media/<uuid>.webp' })
  @IsString()
  @Length(1, 500)
  key: string;

  @ApiPropertyOptional({
    maxLength: 255,
    example: 'bia-vu-lan-2026.webp',
    description: 'Tên gợi nhớ để tìm lại trong thư viện.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}

export class ConfirmCmsMediaBodyDto {
  @ApiProperty({ type: () => ConfirmCmsMediaDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ConfirmCmsMediaDto)
  media: ConfirmCmsMediaDto;
}

export class MediaAssetDto {
  @ApiProperty({ format: 'uuid' }) globalId: string;
  @ApiProperty() storageKey: string;
  @ApiProperty({
    description:
      'Dán URL này vào bất kỳ ô ảnh nào của CMS: banner, bìa blog, chiến dịch Home, nội dung pháp.',
  })
  publicUrl: string;
  @ApiProperty({ example: 'image/webp' }) contentType: string;
  @ApiProperty({ type: String, nullable: true }) fileName: string | null;
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: '`null` khi tài khoản người tải đã bị xoá — ảnh vẫn ở lại.',
  })
  uploadedBy: string | null;
  @ApiProperty({ type: String, nullable: true })
  uploadedByUsername: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}

export class ConfirmCmsMediaResponseDto {
  @ApiProperty({ type: () => MediaAssetDto })
  asset: MediaAssetDto;
}

export class ListCmsMediaQueryDto {
  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Khớp tên tệp hoặc username người tải.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: MaxPageSize, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MaxPageSize)
  pageSize?: number;
}

export class ListCmsMediaResponseDto {
  @ApiProperty({ type: () => [MediaAssetDto], description: 'Mới tải trước.' })
  assets: MediaAssetDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}
