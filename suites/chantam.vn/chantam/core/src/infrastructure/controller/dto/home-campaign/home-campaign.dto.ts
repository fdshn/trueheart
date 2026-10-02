import {
  HomeSectionTypes,
  MaxHomeBanners,
  MaxHomeSections,
} from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Ba DTO lồng dưới đây KHÔNG kiểm chặt từng trường — chỉ kiểm hình dạng thô.
 *
 * Kiểm thật nằm ở `normalizeHome*` trong `core-lib`, và đó là chỗ duy nhất: màu hex, giao
 * thức deep link, `type` của khối, khử trùng `id`, đánh số lại `order`. Viết lại các luật
 * đó bằng decorator ở đây là có hai bản luật cho một việc, và hai bản sẽ lệch.
 *
 * Hệ quả có chủ ý: gửi một màu sai KHÔNG bị 422, nó lặng lẽ về màu mặc định, và response
 * trả lại đúng giá trị đã chuẩn hoá nên Admin thấy ngay thứ mình gõ không được nhận. Đó là
 * hành vi đúng cho một form kéo thả nhiều trường — 422 vì một ô màu làm mất cả bố cục vừa
 * sắp.
 */
export class HomeThemeDto {
  @ApiPropertyOptional({
    example: '#D97706',
    description: 'Hex `#RGB` hoặc `#RRGGBB`. Giá trị khác về màu mặc định.',
  })
  @IsOptional()
  primaryColor?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.chantam.vn/themes/lotus-pattern.webp',
    description: 'Bắt buộc `https://` — ảnh `http://` bị iOS chặn.',
  })
  @IsOptional()
  backgroundPatternUrl?: string | null;

  @ApiPropertyOptional({
    type: [String],
    example: ['#F59E0B', '#D97706'],
    description: 'Tối đa 4 màu. Màu hỏng bị lọc khỏi dải, không bỏ cả dải.',
  })
  @IsOptional()
  headerGradient?: string[];

  @ApiPropertyOptional({ example: 'lotus_flower' })
  @IsOptional()
  greetingIcon?: string | null;
}

export class HomeBannerDto {
  @ApiPropertyOptional({ example: 'b1' })
  @IsOptional()
  id?: string;

  @ApiProperty({ example: 'https://cdn.chantam.vn/banners/vu-lan-2026.webp' })
  @IsString()
  imageUrl: string;

  @ApiPropertyOptional({ example: 'Trao Tặng Quà Vu Lan Cho Người Cao Tuổi' })
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ example: 'Xem Chi Tiết' })
  @IsOptional()
  ctaText?: string | null;

  @ApiPropertyOptional({
    example: 'givingapp://campaign/vu-lan-2026',
    description:
      'Chỉ nhận `givingapp://` hoặc `https://`. Giao thức khác về `null` — chuỗi này đi thẳng vào hàm mở link của app.',
  })
  @IsOptional()
  deepLink?: string | null;
}

export class HomeSectionDto {
  @ApiProperty({
    example: 'sec_hero',
    description: 'Chữ thường, số, `_` và `-`, tối đa 40 ký tự.',
  })
  @IsString()
  id: string;

  @ApiProperty({
    enum: HomeSectionTypes,
    description:
      'Chỉ năm khối client dựng được. `type` lạ bị LOẠI khỏi bố cục — client không tạo được component tuỳ ý (UC-ADM-03 bước 7).',
  })
  @IsIn(HomeSectionTypes as readonly string[])
  type: string;

  @ApiPropertyOptional({ example: 'Đồ Quyên Góp Cần Gấp' })
  @IsOptional()
  title?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({
    example: 1,
    description:
      '`order` được ĐÁNH SỐ LẠI từ 1 sau khi sắp — gửi số trùng hay nhảy bậc đều không sao.',
  })
  @IsOptional()
  order?: number;
}

export class HomePopupDto {
  @ApiProperty({ example: 'https://cdn.chantam.vn/popups/vu-lan.webp' })
  @IsString()
  imageUrl: string;

  @ApiPropertyOptional({ example: 'givingapp://campaign/vu-lan-2026' })
  @IsOptional()
  deepLink?: string | null;
}

export class HomeFloatingBannerDto {
  @ApiProperty({ example: 'Ủng hộ ngay' })
  @IsString()
  label: string;

  @ApiPropertyOptional({ example: 'givingapp://campaign/vu-lan-2026' })
  @IsOptional()
  deepLink?: string | null;
}

export class WriteHomeCampaignDto {
  @ApiProperty({ example: 'Chiến Dịch Vu Lan Báo Hiếu 2026', maxLength: 150 })
  @IsString()
  @Length(3, 150)
  campaignName: string;

  @ApiPropertyOptional({ type: () => HomeThemeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HomeThemeDto)
  theme?: HomeThemeDto;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  marqueeText?: string | null;

  @ApiPropertyOptional({ type: () => [HomeBannerDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MaxHomeBanners)
  @ValidateNested({ each: true })
  @Type(() => HomeBannerDto)
  banners?: HomeBannerDto[];

  @ApiPropertyOptional({ type: () => [HomeSectionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MaxHomeSections)
  @ValidateNested({ each: true })
  @Type(() => HomeSectionDto)
  sectionsLayout?: HomeSectionDto[];

  @ApiPropertyOptional({ type: () => HomePopupDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => HomePopupDto)
  popup?: HomePopupDto | null;

  @ApiPropertyOptional({ type: () => HomeFloatingBannerDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => HomeFloatingBannerDto)
  floatingBanner?: HomeFloatingBannerDto | null;

  @ApiProperty({ example: '2026-08-01T00:00:00.000Z' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ example: '2026-08-31T23:59:59.000Z' })
  @IsDateString()
  endTime: string;

  @ApiProperty({
    example: false,
    description:
      'Bật thì chiến dịch này KHÔNG được trùng giờ với một chiến dịch đang bật khác (BR_CAMP_01) — ràng buộc nằm dưới database, trả 409.',
  })
  @IsBoolean()
  isActive: boolean;
}

export class WriteHomeCampaignBodyDto {
  @ApiProperty({ type: () => WriteHomeCampaignDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => WriteHomeCampaignDto)
  campaign: WriteHomeCampaignDto;
}

export class ListHomeCampaignsQueryDto {
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
}

export class HomeCampaignResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  campaignName: string;

  @ApiProperty({ type: () => HomeThemeDto })
  theme: HomeThemeDto;

  @ApiProperty({ nullable: true })
  marqueeText: string | null;

  @ApiProperty({ type: () => [HomeBannerDto] })
  banners: HomeBannerDto[];

  @ApiProperty({
    type: () => [HomeSectionDto],
    description:
      'Bố cục ĐÃ CHUẨN HOÁ: khối lạ đã bị loại, `order` đã đánh số lại.',
  })
  sectionsLayout: HomeSectionDto[];

  @ApiProperty({ type: () => HomePopupDto, nullable: true })
  popup: HomePopupDto | null;

  @ApiProperty({ type: () => HomeFloatingBannerDto, nullable: true })
  floatingBanner: HomeFloatingBannerDto | null;

  @ApiProperty()
  startTime: Date;

  @ApiProperty()
  endTime: Date;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({
    description:
      'Khác `isActive`: chiến dịch tháng sau có `isActive: true` mà `isLive: false`. CMS phải hiện hai cái khác nhau, nếu không Admin bật xong tưởng đã đổi Home.',
  })
  isLive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ListHomeCampaignsResponseDto {
  @ApiProperty({ type: () => [HomeCampaignResponseDto] })
  items: HomeCampaignResponseDto[];

  @ApiProperty()
  total: number;
}

export class HomeCampaignMutationResponseDto {
  @ApiProperty({ type: () => HomeCampaignResponseDto })
  campaign: HomeCampaignResponseDto;

  @ApiProperty({
    description:
      '`false` nghĩa là đã LƯU nhưng chưa xoá được đệm Redis — bố cục cũ còn phục vụ tới một giờ. CMS nên nói rõ điều đó thay vì báo thành công trơn.',
  })
  cacheInvalidated: boolean;
}

export class HomeLayoutResponseDto {
  @ApiProperty({
    nullable: true,
    description:
      '`null` nghĩa là đang dùng bố cục MẶC ĐỊNH vì không chiến dịch nào tới hiệu lực (BR_CAMP_02).',
  })
  campaignId: string | null;

  @ApiProperty()
  campaignName: string;

  @ApiProperty({ type: () => HomeThemeDto })
  theme: HomeThemeDto;

  @ApiProperty({ nullable: true })
  marqueeText: string | null;

  @ApiProperty({ type: () => [HomeBannerDto] })
  banners: HomeBannerDto[];

  @ApiProperty({ type: () => [HomeSectionDto] })
  sectionsLayout: HomeSectionDto[];

  @ApiProperty({ type: () => HomePopupDto, nullable: true })
  popup: HomePopupDto | null;

  @ApiProperty({ type: () => HomeFloatingBannerDto, nullable: true })
  floatingBanner: HomeFloatingBannerDto | null;
}
