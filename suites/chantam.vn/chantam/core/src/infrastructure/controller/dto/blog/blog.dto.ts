import {
  BlogCategories,
  BlogCategory,
  MaxBlogSlugLength,
  MaxBlogSummaryLength,
  MaxBlogTitleLength,
} from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
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

export class WriteBlogDto {
  @ApiProperty({
    example: 'Tâm Từ Và Hạnh Bố Thí',
    maxLength: MaxBlogTitleLength,
  })
  @IsString()
  @Length(3, MaxBlogTitleLength)
  title: string;

  @ApiPropertyOptional({
    example: 'tam-tu-va-hanh-bo-thi',
    maxLength: MaxBlogSlugLength,
    description:
      'Bỏ trống thì sinh từ tiêu đề. Gửi vào thì vẫn bị chuẩn hoá y hệt (bỏ dấu, chữ thường, gạch nối) — không có hai cách viết cho một đường.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MaxBlogSlugLength)
  slug?: string;

  @ApiProperty({ enum: BlogCategories })
  @IsIn(BlogCategories as readonly string[])
  category: BlogCategory;

  @ApiPropertyOptional({ maxLength: MaxBlogSummaryLength })
  @IsOptional()
  @IsString()
  @MaxLength(MaxBlogSummaryLength)
  summary?: string | null;

  @ApiPropertyOptional({
    example: '<h2>Tâm từ</h2><p>Bố thí có <strong>ba bậc</strong>.</p>',
    description:
      'HTML được LỌC trước khi lưu: chỉ còn `p h2-h4 strong b em i u s blockquote ul ol li a img figure figcaption hr code pre`. Thẻ khác bị bỏ, `on*` bị bỏ, `style` bị bỏ, và `href`/`src` chỉ nhận `https`. `a` bị buộc thêm `rel="noopener noreferrer"`.',
  })
  @IsOptional()
  @IsString()
  contentHtml?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.chantam.vn/blog/tam-tu.webp',
    description: 'Bắt buộc `https` và bắt buộc CÓ khi xuất bản.',
  })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string | null;

  @ApiProperty({
    example: false,
    description:
      'Bản nháp (`false`) lưu được dù thiếu nội dung và ảnh bìa. Bật lên thì đòi đủ cả hai, và đòi nội dung còn CHỮ sau khi lọc HTML.',
  })
  @IsBoolean()
  isPublished: boolean;
}

export class WriteBlogBodyDto {
  @ApiProperty({ type: () => WriteBlogDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => WriteBlogDto)
  blog: WriteBlogDto;
}

export class ListBlogsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ enum: BlogCategories })
  @IsOptional()
  @IsIn(BlogCategories as readonly string[])
  category?: BlogCategory;
}

export class BlogSummaryResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ enum: BlogCategories })
  category: BlogCategory;

  @ApiProperty({
    example: 'Phật Pháp',
    description:
      'Nhãn tiếng Việt đi kèm mã, để CMS và trang công khai không phải tự dịch ở hai nơi rồi lệch nhau.',
  })
  categoryLabel: string;

  @ApiProperty({ nullable: true })
  summary: string | null;

  @ApiProperty({ nullable: true })
  thumbnailUrl: string | null;

  @ApiProperty()
  viewCount: number;

  @ApiProperty()
  isPublished: boolean;

  @ApiProperty({ nullable: true })
  publishedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class BlogDetailResponseDto extends BlogSummaryResponseDto {
  @ApiProperty({
    description:
      'HTML ĐÃ LỌC — đúng thứ đang nằm trong database, không lọc lại lúc đọc.',
  })
  contentHtml: string;
}

export class ListBlogsResponseDto {
  @ApiProperty({
    type: () => [BlogSummaryResponseDto],
    description: 'KHÔNG mang `contentHtml` — một trang 20 bài sẽ là vài MB.',
  })
  items: BlogSummaryResponseDto[];

  @ApiProperty()
  total: number;
}

export class DeleteBlogResponseDto {
  @ApiProperty({ description: 'Xoá MỀM — `slug` vẫn giữ chỗ.' })
  deleted: boolean;
}
