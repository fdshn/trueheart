import {
  DharmaContentTypes,
  DharmaHubEntries,
  MaxDharmaBodyLength,
  MaxDharmaCategoryLength,
  MaxDharmaSummaryLength,
  MaxDharmaTitleLength,
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
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class WriteDharmaContentDto {
  @ApiProperty({
    enum: DharmaContentTypes,
    description:
      'Một engine cho ba loại nội dung (BR-DHARMA-01): `SUTRA` Kinh sách · `INFO` Thông ' +
      'tin · `TEMPLE_INTRO` Giới thiệu chùa. Chỉ `SUTRA` tụng được (UC-DHARMA-02).',
  })
  @IsIn(DharmaContentTypes as readonly string[])
  contentType: string;

  @ApiPropertyOptional({
    example: 'kinh-dai-thua',
    maxLength: MaxDharmaCategoryLength,
    description:
      'Danh mục, chuẩn hoá về dạng slug ở cả lượt ghi và lượt lọc. KHÔNG có allowlist — ba ' +
      'loại nội dung có ba tập danh mục rời nhau, và một danh mục gõ sai hiện ngay thành ' +
      'một giá trị lọc riêng cạnh giá trị đúng (khác `placement` của banner, sai thì im lặng).',
  })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  category?: string;

  @ApiProperty({
    example: 'Kinh Địa Tạng Bồ Tát Bổn Nguyện',
    maxLength: MaxDharmaTitleLength,
  })
  @IsString()
  @Length(3, MaxDharmaTitleLength)
  title: string;

  @ApiPropertyOptional({
    description:
      'Bỏ trống thì sinh từ tiêu đề. `đ` được xử lý đúng — "Địa Tạng" ra "dia-tang".',
  })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  slug?: string;

  @ApiPropertyOptional({ maxLength: MaxDharmaSummaryLength })
  @IsOptional()
  @IsString()
  @Length(1, MaxDharmaSummaryLength)
  summary?: string;

  @ApiPropertyOptional({
    maxLength: MaxDharmaBodyLength,
    description:
      'Nội dung bản chữ. Trần 2 triệu ký tự — một bộ kinh dài hơn một bài blog rất nhiều. ' +
      'Bản nháp để trống được; xuất bản thì bắt buộc.',
  })
  @IsOptional()
  @IsString()
  @Length(0, MaxDharmaBodyLength)
  bodyText?: string;

  @ApiPropertyOptional({
    description:
      'Audio tụng, nếu Admin có cấu hình (UC-DHARMA-02). Bắt buộc `https://` — audio qua ' +
      '`http` bị trình duyệt và iOS chặn phát, và lỗi đó chỉ hiện lúc người dùng bấm Nghe.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 2_000)
  audioUrl?: string;

  @ApiPropertyOptional({ description: 'Bắt buộc `https://` nếu có gửi.' })
  @IsOptional()
  @IsString()
  @Length(1, 2_000)
  coverUrl?: string;

  @ApiPropertyOptional({ minimum: 0, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional({
    default: false,
    description: 'Hiện ở khối nổi bật của Dharma Hub.',
  })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      'Xuất bản. `published_at` chỉ đặt ở lượt xuất bản ĐẦU — sửa tiếp một bản đã công khai ' +
      'KHÔNG đẩy nó lên đầu danh sách "mới xuất bản".',
  })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class WriteDharmaContentBodyDto {
  @ApiProperty({ type: () => WriteDharmaContentDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => WriteDharmaContentDto)
  content: WriteDharmaContentDto;
}

/** Lượt sửa: mọi trường tuỳ chọn, bỏ trống nghĩa là "không đổi". */
export class PatchDharmaContentDto {
  @ApiPropertyOptional({ enum: DharmaContentTypes })
  @IsOptional()
  @IsIn(DharmaContentTypes as readonly string[])
  contentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 200)
  category?: string;

  @ApiPropertyOptional({ maxLength: MaxDharmaTitleLength })
  @IsOptional()
  @IsString()
  @Length(3, MaxDharmaTitleLength)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  slug?: string;

  @ApiPropertyOptional({ maxLength: MaxDharmaSummaryLength })
  @IsOptional()
  @IsString()
  @Length(0, MaxDharmaSummaryLength)
  summary?: string;

  @ApiPropertyOptional({ maxLength: MaxDharmaBodyLength })
  @IsOptional()
  @IsString()
  @Length(0, MaxDharmaBodyLength)
  bodyText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 2_000)
  audioUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 2_000)
  coverUrl?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class PatchDharmaContentBodyDto {
  @ApiProperty({ type: () => PatchDharmaContentDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PatchDharmaContentDto)
  content: PatchDharmaContentDto;
}

export class ListDharmaContentsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ enum: DharmaContentTypes })
  @IsOptional()
  @IsIn(DharmaContentTypes as readonly string[])
  contentType?: string;

  @ApiPropertyOptional({ description: 'Chuẩn hoá về slug trước khi lọc.' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  category?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  featuredOnly?: boolean;
}

export class ListAdminDharmaContentsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ enum: DharmaContentTypes })
  @IsOptional()
  @IsIn(DharmaContentTypes as readonly string[])
  contentType?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Gồm cả bản nháp. Mặc định `true` — CMS tồn tại để soạn nháp.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeDrafts?: boolean;
}

export class DharmaContentIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id: string;
}

export class DharmaContentSummaryResponseDto {
  @ApiProperty() globalId: string;

  @ApiProperty({ enum: DharmaContentTypes })
  contentType: string;

  @ApiProperty({ nullable: true }) category: string | null;
  @ApiProperty() title: string;
  @ApiProperty() slug: string;
  @ApiProperty({ nullable: true }) summary: string | null;
  @ApiProperty({ nullable: true }) audioUrl: string | null;
  @ApiProperty({ nullable: true }) coverUrl: string | null;
  @ApiProperty() displayOrder: number;
  @ApiProperty() isFeatured: boolean;
  @ApiProperty() isPublished: boolean;
  @ApiProperty({ nullable: true }) publishedAt: Date | null;
  @ApiProperty() viewCount: number;
  @ApiProperty({ nullable: true }) createdBy: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class DharmaContentResponseDto extends DharmaContentSummaryResponseDto {
  @ApiProperty({
    description:
      'Nội dung bản chữ. CHỈ có ở đường chi tiết, không ở danh sách.',
  })
  bodyText: string;
}

export class ListDharmaContentsResponseDto {
  @ApiProperty({ type: () => [DharmaContentSummaryResponseDto] })
  items: DharmaContentSummaryResponseDto[];

  @ApiProperty() total: number;
}

export class DharmaContentDetailResponseDto {
  @ApiProperty({ type: () => DharmaContentResponseDto })
  content: DharmaContentResponseDto;

  @ApiProperty({
    description:
      'Số lượt tụng ĐÃ HOÀN TẤT — đếm lúc đọc, không phải cột lưu sẵn.',
  })
  completedRecitationCount: number;

  @ApiProperty({ description: '`true` chỉ với `SUTRA` đã xuất bản.' })
  isRecitable: boolean;
}

export class DharmaContentWrapperResponseDto {
  @ApiProperty({ type: () => DharmaContentResponseDto })
  content: DharmaContentResponseDto;
}

export class DharmaRecitationResponseDto {
  @ApiProperty() globalId: string;
  @ApiProperty() contentId: string;
  @ApiProperty() userId: string;
  @ApiProperty() startedAt: Date;
  @ApiProperty({ nullable: true }) completedAt: Date | null;

  @ApiProperty({
    nullable: true,
    description:
      'Tính ở DATABASE từ `startedAt` tới lúc đánh dấu xong. KHÔNG nhận từ client — một con ' +
      'số do client gửi là con số người dùng sửa được.',
  })
  durationSeconds: number | null;
}

export class DharmaRecitationWrapperResponseDto {
  @ApiProperty({ type: () => DharmaRecitationResponseDto })
  recitation: DharmaRecitationResponseDto;
}

export class ListDharmaRecitationsResponseDto {
  @ApiProperty({ type: () => [DharmaRecitationResponseDto] })
  items: DharmaRecitationResponseDto[];

  @ApiProperty() total: number;
}

export class DharmaHubEntryResponseDto {
  @ApiProperty({ enum: DharmaHubEntries })
  entry: string;

  @ApiProperty() label: string;

  @ApiProperty({
    description:
      'Đường API client gọi khi bấm. `MERIT` trỏ sang `/merit-units` — UC-DHARMA-05 nói tái ' +
      'dùng nghiệp vụ Công đức ở §3.3.11, nên Phật Pháp KHÔNG có bảng công đức riêng.',
  })
  path: string;

  @ApiProperty({
    nullable: true,
    description:
      '`null` khi entry không đếm được từ `dharma_contents` — `0` ở đó đọc ra "không có gì", ' +
      'trong khi sự thật là con số phụ thuộc người đang xem hoặc thuộc phân hệ khác.',
  })
  itemCount: number | null;
}

export class DharmaHubResponseDto {
  @ApiProperty({ type: () => [DharmaHubEntryResponseDto] })
  entries: DharmaHubEntryResponseDto[];
}

export class DeleteDharmaContentResponseDto {
  @ApiProperty() deleted: boolean;
}
